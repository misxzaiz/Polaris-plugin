# 拾光机（time-sift）

> 把 Polaris 已拥有却从未被开采的资产——历史 AI 会话——变成可检索、可回忆、可视化的个人记忆库。

## 这是什么

你在 Polaris 对话、session-v2、Claude Code、ZCode 里聊过的每一个方案、每一次排错，散落在四个数据源里，宿主只有一个关键词列表搜索。拾光机把它们归一成**一个可全文检索、可让 AI 回忆、可看足迹的记忆库**：

- **零冷启动**：装上即有全部历史价值（不像其他插件要先喂内容）
- **AI 可回忆**：聊天里对 AI 说「我之前怎么解决 XX 的」，它用 sift_search 翻你的历史再回答
- **足迹可视化**：GitHub 风格 26 周热力图 + 会话/消息/token 总量 + 来源分布
- **纯本地**：数据源只读、索引缓存在本机、零外网请求；跨端经 cap.kv（桌面/手机/Web 同一账号）

实测本机 1.2GB 原始语料（972 会话）→ 37MB 索引，全量重建 ~40s，检索 ~2s 出结果。

## 功能

- **面板**（ActivityBar → 🕐 拾光机）四 Tab：
  - **搜索**：关键词 + 来源筛选 + 时间范围 → 命中片段（高亮）→ 点击进阅读器（围绕命中消息翻上下文）
  - **足迹**：总卡（会话/消息/散文/活跃天）+ 26 周热力图 + 来源分布 + Top 活跃日 + token 口径
  - **时光机**：按天分组的会话列表（标题过滤 + 来源筛选），点开阅读
  - **设置**：服务管理（自举 start/stop）+ 索引状态/重建 + 四源开关 + 排除词 + 隐私说明
- **后台服务**：四路数据源唯一读取者，建 CJK 双元倒排索引（term→会话，超限晋级 common），JSONL 源 30s 增量（mtime）、SQLite 源每 10 分钟全量 diff（指纹比对），目录/统计分块写 cap.kv
- **MCP 工具**（5 个 `sift_*`）：聊天里让 AI 直接检索/翻开/统计你的历史

## 数据源与口径

| source | 位置 | 读法 |
|---|---|---|
| `polaris` | `<数据根>/dialogs/*.jsonl`（v3：首行 meta） | fs 只读，按 message.id 去重 |
| `v2` | `<数据根>/session-v2/messages.db` + `state.db` | node:sqlite 只读，同 id 取最大 version，排除 tombstoned |
| `claude` | `~/.claude/projects/<项目>/<sessionId>.jsonl` | fs 只读，跳过 isSidechain 行与 `subagents/` 子目录 |
| `zcode` | `~/.zcode/cli/db/db.sqlite` | node:sqlite 只读，跳过软删会话与 `uiVisibility:hidden` 消息 |

- **只索引对话散文**（用户输入 + AI 回复文本块）：工具调用/输出、thinking/reasoning 不入索引——记忆价值在对话不在工具 I/O，体积降一个量级。
- Claude 的 Stop-hook 包装消息（`A session-scoped Stop hook is now active with condition: "…"`）剥壳保留 `…` 里的真实意图——28/214 实测会话的标题靠它还原。
- token/费用只对「能取到用量」的会话累加（polaris meta.tokenUsage / claude 行 usage / zcode turn_usage），UI 明示覆盖口径，不臆造补零。
- 路径兼容：anchor.json → 数据根；实例 0（`<root>/dialogs`）为限，instances/n 不扫。

## 架构（数据面与跨域）

```
面板（React bundle，宿主 invoke 通道；绝不直接 fetch，零跨域面）
  └─ cap.kv sift.* 键空间（目录分块/统计/心跳/命令信箱） ←── 三方同一事实库
        ▲                                    ▲
MCP server（stdio；timeline/stats 直读 kv，   │ 命令信箱 cmd.<op>.<nonce>
search/open 走信箱）                          │ 先删后做
                                             ▼
        service/sift.js —— 唯一读源/唯一写者（索引在内存，blob/倒排/目录落 <appConfigDir>/time-sift/）
                                             ▼
        四路数据源（fs 只读 + node:sqlite 只读；零外网请求）
```

- 面板零外网请求、零 fs——源读取与索引全部在服务进程（node），跨端（手机 Web）自动一致。
- 检索/阅读走命令信箱：面板/MCP 写 `sift.cmd.<op>.<nonce>` → 服务先删后做 → 结果写 `sift.result.<nonce>` → 请求方轮询读后删。
- 目录/统计直读 kv：服务离线时足迹与时光机仍可浏览。

## 键空间契约（权威表——三方一致，改动须同步）

| 键 | 写者 | 读者 | 说明 |
|---|---|---|---|
| `sift.settings` | 面板/MCP | 服务（30s 热读） | `{sources:{polaris,v2,claude,zcode}, excludeKeywords[], maxMsgChars, sqliteRefreshMin}` |
| `sift.meta` | **服务单写**（60s 心跳） | 面板/MCP | version/pid/bridge/degraded/dataRoot/sqlite/indexing 进度/catalog 概况/各源状态 |
| `sift.cat.head` | **服务单写** | 面板/MCP | `{count, chunks, rev, builtAt}` |
| `sift.cat.<n>` | **服务单写** | 面板/MCP | 目录分块数组（≤200 条/块），sid/source/title/时间/消息数/tokens |
| `sift.stats.total` | **服务单写** | 面板/MCP | 总计卡（bySource/tokens 覆盖口径） |
| `sift.stats.daily` | **服务单写** | 面板 | 按天聚合 `{'YYYY-MM-DD':{s,m}}`（本地时区，按 updatedAt 落天） |
| `sift.cmd.<op>.<nonce>` | 面板/MCP 写 → 服务**先删后做** | — | op ∈ search/open/reindex（reindex 需 confirm:true） |
| `sift.result.<nonce>` | 服务写，请求方读后删 | 请求方 | `{ok, data|error, at}`；服务顺带回收 >1h 孤儿 |
| `sift.smoke.*` | 仅冒烟 | — | 冒烟独立子前缀，100% 清理 |

sid 规则：`<源字母>+sha256(源|稳定键)前10位`（polaris=externalId、v2=conversation_id、claude=sessionId、zcode=session.id），跨重装稳定。

## MCP 工具（AI 回忆入口）

| 工具 | 用途 |
|---|---|
| `sift_search` | 全文检索历史（「我之前是不是解决过…」「找找我聊过 xx 的会话」），返回标题+片段+sid |
| `sift_open_session` | 按 sid 读会话对话（可 around 命中消息定位），AI 据此回答「当时怎么做的」 |
| `sift_timeline` | 按天列会话（「上周三我干了啥」）；直读 kv，服务离线可用 |
| `sift_stats` | 足迹统计 + 索引状态 |
| `sift_reindex` | 触发全量重建（confirm 护栏，异步执行，进度看 sift_stats） |

## 构建 / 测试 / 打包

```bash
npm install && npm run typecheck   # 面板类型检查（tsc --noEmit）
npm run build                      # 面板 bundle → dist/panel.js（esbuild，external react）
node test/run-tests.mjs            # 离线单测（零依赖，不需 Polaris 运行）
node test/smoke-real.mjs           # 真实桥冒烟（需本机 Polaris 在跑；临时 fixture + 自清理，不碰真实数据根）
node ../../scripts/pack.js plugins/time-sift   # 打 zip + sha256
```

冒烟通过 env `SIFT_DATA_ROOT_OVERRIDE` 把服务源定位限定在临时目录（生产不生效），护栏检测到生产 `sift.*` 业务键即拒跑。

## 已知边界（如实）

- **node ≥ 22.5**（node:sqlite）：不可用时 v2/zcode 两源自动降级关闭（meta.sqlite=false 标明），JSONL 双源不受影响。
- subagent 转录（`~/.claude/projects/<proj>/<id>/subagents/*.jsonl`）不入索引（与 sidechain 行同一口径）；v2 历史版本只取最新。
- 双 Polaris 实例并发会各建一份索引（罕见场景，未做租约；互不损坏，浪费一倍磁盘）。
- 检索只匹配正文，标题单独命中不出结果（标题已参与倒排，用于候选排序加分）。
- 检索延迟 ~2s（命令信箱经 2s tick 消费）；面板时光机/足迹走直读不受影响。
- `maxMsgChars` 改动只对新扫描生效，历史条目需重建索引。
