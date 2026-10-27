# 琥珀 amber —— 网页封藏馆

把任意网页「琥珀化」：一键把 URL 封存成**永久可读快照**。原网页日后失效（404/改版/付费墙），琥珀里的快照是你唯一的遗产。

## 它解决什么问题

- **跨域**：浏览器有同源策略，面板直接 fetch 任何第三方页面都会被拦死。本插件把抓取全部下沉到后台服务（Node 原生 fetch，无同源策略）——这是本插件跨域问题的根治点，与 feed-radar / page-sentinel / bookmark-dig 同一铁律。
- **永久**：网页会失效、会被改写、会进付费墙。封存快照 = 内容本体入自己的库。
- **找得回**：BM25-lite 全文检索覆盖封存正文的全部文字（不只是标题），支持中英文。
- **AI 原生**：聊天里直接让 AI「把这篇存进琥珀」「我收藏的内容里有没有讲 XX 的」「读一下 [id] 给我总结」。

## 与邻居插件的分工

| 插件 | 收的是什么 | 节奏 |
|---|---|---|
| feed-radar 订阅雷达 | 「源」（RSS/Atom） | 周期性自动 |
| page-sentinel 网页哨兵 | 「变化」 | 周期性盯梢 |
| bookmark-dig 书签考古 | 「书签」 | 一次性体检 |
| news-curator AI 刊物 | AI 拉给你的 | 每日一期 |
| **琥珀** | **「页」（用户主动收藏）** | **一次性、存内容本体** |

## 使用

- **面板**：贴 URL → 封存（可带标签）→ 收藏列表 → 阅读视图。阅读时选中正文可「✂ 摘录选中文字」存金句。检索 Tab 全文搜索。手机 Web 同一份 cap.kv 数据。
- **AI（MCP 7 工具）**：
  - `amber_save {url, tags?, force?, waitSec?}` 封存（同 URL 幂等，重复=层积重封）
  - `amber_list {filter?, tag?, host?, status?, limit?}` 翻收藏库
  - `amber_search {q, limit?, waitSec?}` 全文检索语料库
  - `amber_read {id|url, maxChars?}` 读封存全文（AI 精读主入口）
  - `amber_mark {id, read?, star?, tagsAdd?, tagsRemove?}` 状态/标签
  - `amber_quote {itemId, text, note?}` 存金句；`{itemId?, list:true}` 列摘录
  - `amber_delete {id|url}` 删除（联动清理）

## 封存质量

- **打分容器抽取**（相对 article→main→body 硬切片的升级）：候选段落向 parent/grandparent 记分（段长+标点），链接密度惩罚，噪声 class（sidebar/share/…）熄灭；最高分容器向上收并（保住容器内标题），输出 Markdown-lite（`#` 标题/`-` 列表/`>` 引用/``` 代码块/表格行）。
- **字符集三级探测**：BOM → Content-Type 头 → `<meta charset>`，TextDecoder 解 gb18030/big5/shift_jis 等历史编码，GBK 老页面不乱码。
- **兜底链**：评分容器 <400 字 → article/main/body 硬切片 → 择长 → <80 有效字报「JS 渲染空壳」（如实报错，不塞垃圾）。
- **层积语义**：同一 URL 重复封存 = 快照更新 + `sealCount++`，`firstSealedAt` 首封时间永留，阅读状态/标签/星标不重置。
- **失败安全**：封存失败只置 `status=error`，**永不摧毁旧快照**。
- **礼貌策略**：同主机 5s 间隔、每 tick 最多封 3 条、4MB/20s 上限、浏览器 UA。
- **SSRF 守卫**：只抓公网 http(s)；环回/内网/链路本地（含云元数据 169.254）全拒——URL 是任意端可写的第三方数据。

## amber.* 键空间契约（权威）

三方共享（service/amber.js 独写封存字段；面板与 mcp/server.js 写用户状态与登记；改动必须三方同步）：

| 键 | 写者 | 内容 |
|---|---|---|
| `amber.item.<id>` | 三方 | 条目元数据。id = `b`+sha256(url) 前 12 位（同 URL 永远同一 id → 幂等）。字段见 `service/lib.js normalizeItem`：`{id,url,host,title,byline,publishedAt,excerpt,img,wordCount,tags[],star,read,status(pending/ok/error),error,sealedAt,firstSealedAt,sealCount,createdAt,rev}` |
| `amber.body.<id>` | 仅服务 | 封存正文快照 `{id,ok,title,text(Markdown-lite,≤60k),charset,bytes,sealNo,fetchedAt}`；失败时**不写**（保留旧快照） |
| `amber.quote.<qid>` | 面板/MCP | 金句摘录 `{qid,itemId,itemTitle,itemHost,text,note,createdAt}`；qid = `q`+sha256(itemId+'|'+text) 前 10 位（跨写者内容级去重） |
| `amber.settings` | 面板/MCP | `{sweepEnabled,keepDays,maxItems}`；服务 60s 内重读 |
| `amber.meta` | 仅服务 | 心跳（60s）`{version,pid,startedAt,lastTickAt,bridge,items,pending,errors,unread,starred,quotes,settings}` |
| `amber.cmd.amberize.<n>` | 面板/MCP | `{op:'amberize',url,tags,at}` → 服务消费即删 |
| `amber.cmd.refresh.<id>` | 面板/MCP | `{op:'refresh',id,at}` 重封存 |
| `amber.cmd.forget.<id>` | 面板/MCP | `{op:'forget',id,at}` 删条目兜底清理 |
| `amber.cmd.purge.<n>` | 面板/MCP | `{op:'purge',at}` 清空全部（保留设置） |
| `amber.cmd.search.<n>` | 面板/MCP | `{op:'search',q,limit,at}` → 服务写结果槽 |
| `amber.search.<n>` | 仅服务 | `{q,total,hits[{id,title,host,score,snippet}],doneAt}` 或 `{q,error,doneAt}`；调用方读后删；>1h 死槽被清扫 |

- `rev`：条目任何写方递增；面板据此感知变化（当前实现为每轮全读条目键，rev 为后续增量优化预留）。
- 服务是封存字段的**单写权威**：面板/MCP 永不写 `amber.body.*` 与 `amber.meta`。
- 清扫：`sweepEnabled=false`（默认）**永不清理**；开启后非星标按 keepDays/maxItems 清，星标永豁免。

## 架构

```
面板(blob iframe) ──router_dispatch──▶ cap.kv（amber.*）
   │                                      ▲
   └──cap.pluginServiceManager 自举 start──┤
                                          │ 读写
MCP(stdio) ──kvclient 自发现桥──▶ /api/router-dispatch
                                        │
                        服务 amber.js（唯一抓取路径，原生 fetch）
                          ├─ SSRF 守卫 → fetch(4MB/20s) → charset 解码
                          ├─ 打分容器抽取 → Markdown-lite
                          └─ 命令信箱消费 / 清扫 / 心跳
```

- 服务自发现端点（Polaris 不注入 env）：anchor.json → dataRoot/config.json（web.port/token）→ 端口向上扫 25 个；鉴权 `Bearer md5(web.token)`。
- 面板打包：esbuild `--format=esm --external:react --external:react/jsx-runtime`（宿主经 blob URL + React shim 加载）。
- 服务类型 http + `/__health`；桥不可达时健康端点仍 200（降级状态见 `amber.meta`），避免被误杀重启循环。

## 测试

```bash
cd plugins/amber
npm install          # 仅开发用（esbuild/typescript），不进安装包
npm run typecheck
npm run build
node test/run-tests.mjs      # 离线单测（lib/html/charset/extract/searcher）
node test/smoke-real.mjs     # 真实桥冒烟（需本机 Polaris 在跑 + 外网；跑完自清理）
```

## 已知边界

- JS 渲染的 SPA 页面抓不到正文（无头渲染不在插件能力内）——报「JS 渲染空壳」，此类页建议找其 RSS/JSON 接口或让 AI 用内置浏览器读后转存（AI 把正文粘贴给你手动建摘录）。
- 反爬严格的站点可能返回验证页——封出来的正文会如实反映页面内容。
- 检索是每次现算（语料数百篇内秒级）；语料上千后可考虑预建倒排（`rev` 字段已为此预留）。
