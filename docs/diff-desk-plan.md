# diff-desk · Diff 对比台 —— 选型与设计 spec

> 2026-11-02 定案。选型方法：生态 78 插件全目录测绘（零 diff/对比类占位）→ 外部市场证据交叉验证 → 八维评分（满分 100）→ 12 候选中胜出。

## 一、产品定位

- **名称**：Diff 对比台（id: `diff-desk`，kv 前缀 `dfx.*`，端口 9877）
- **一句话**：把「这两份文本 / 这两个 JSON / 这两个目录 / 这两个接口响应到底差在哪」变成一次 30 秒、**数据不出本机**的结构化对比：行级 Myers diff + 键序无关、数组对齐的 JSON 语义 diff + 差异路径清单 + 并排/统一视图，AI 经 MCP 一句话发起对比并解释差异。
- **目标用户**：开发者 / QA / 运维（Polaris 用户自身），日常需要对比两版内容的人。
- **核心场景**（按频率排序）：
  1. **JSON 语义对比**：接口响应 before/after、两环境配置——行级 diff 工具对 JSON 噪音巨大（键序/缩进/数组重排全被误报），语义 diff 直接给出「哪个路径的哪个值变了」。
  2. **敏感 payload 对比**：带 token 的 API 响应、内网配置——不能贴到在线 diff 工具（diffchecker 等上传即出域）。
  3. **配置/代码/env 片段行级对比**：并排 + 行内字符级高亮。
  4. **目录对比**：部署前后 / 两个构建产物 / 两个配置目录哪些文件变了。
  5. **AI 驱动对比**：对话里说「比下这两个文件差在哪」「staging 和 prod 的 /api/config 有什么不一样」，AI 调 MCP 工具并解释差异。

## 二、市场证据（可追溯）

1. **需求真实且高频**：diffchecker.com（SaaS、免费档限流+付费墙）长期存在即证明；VS Code/Meld/Beyond Compare 全部内置 diff 视图——每个开发环境都装了一遍 diff。
2. **行级工具对结构化数据不够好**：专门解决「键序/数组重排误报」的语义 diff 工具在 2024-2026 涌现并以此为核心卖点（Smart JSON Diff、JSONvs、online-json JSON Compare 等）；Reddit r/json「Best JSON comparison tool」等社区帖持续出现同类求助。
3. **隐私是已被市场验证的付费理由**：Privy Tools / jsonindenter 等以「不上传、纯浏览器内对比」为卖点做产品与评测文章（《JSON Tools That Keep Your Data Private》）；Sitecore 等厂商明确警告用户勿把含敏感数据的 HAR/内容传公开工具（har-lens 选型时已取证）。
4. **生态内部证据**：relay-devkit（本生态开发者工具箱）的 plan 明确把「文本 Diff 小工具」列入 wanted-but-not-done；全仓 78 插件 grep 零 diff/对比占位。

## 三、竞品格局与差异化

| 竞品 | 形态 | 缺口 |
|---|---|---|
| VS Code / Meld / Beyond Compare | 桌面/IDE | 行级强，JSON 语义弱（键序/数组重排噪音）；无接口对比 |
| diffchecker.com | 在线 SaaS | 上传出域（敏感 payload 不可用）、免费限流、无目录深对比 |
| Smart JSON Diff / JSONvs | 在线 | 同上：出域；大 JSON 受浏览器限制；无文件/目录/接口对比 |
| jd / json-diff（CLI） | 命令行 | 无 UI、无对齐视图、无 AI 集成 |
| har-lens（本生态） | 插件 | 只比 HAR 文件（抓包产物），不做任意文本/JSON/目录/在线接口 |

**差异化四件**：① 键序无关+数组相似度对齐的语义 diff；② 双 URL 在线对比（SSRF 围栏内）——通用 diff 站没有；③ 目录对比；④ 全程本机 + AI 经 MCP 驱动与解释。

## 四、八维评分（胜出项）

痛点 4.5×20% + 频率人群 5×15% + 方案缺口 4×15% + 差异化 4×15% + 收益 4×15% + 平台适配 5×10% + 可行性 5×5% + 成本 4×5% = **88/100**。

落选代表：正则调试台 65.5（regex101 免费且足够好）；编解码杂烩台 64.5（单点太薄、CyberChef 30k★ 压制）；TLS 深检 69.5（撞 domain-probe 边界）；CSV 工坊 76（备选第二，受众较窄）；AI 结构化提取 67（key 管理摩擦）。

## 五、MVP 范围

**做**：四对比模式（文本/JSON/目录/双 URL）、行内字符级高亮、并排+统一视图、统一 patch 文本导出、JSON 差异路径清单+忽略路径（glob）、数组对齐开关、历史留档（仅元数据）、SSRF 围栏抓取、MCP 七工具（df_diff_text/files/dirs/urls/history/status/selftest）、试金石自检。

**不做**（边界）：编辑/合并/三方合并、AST 级代码 diff、word/excel/pdf 内容 diff、定时监控、云同步、diff 结果的服务端存储（正文永不落 kv）。

## 六、架构

```
shared/core.js     纯逻辑零依赖：Myers 行 diff/字级行内 diff/hunks/并排配对/语义 JSON diff(键序无关+数组 LCS 对齐+忽略路径 glob)/目录对比/摘要
service/main.js    HTTP 127.0.0.1 单机服务：diff_text/diff_files/diff_dirs/diff_urls/history/selftest，护栏与截断
service/files.js   只读文件/目录（大小上限 20MB/文件、目录 2 万条目、UTF-8→GBK 回退）
service/fetcher.js SSRF 围栏：仅 http(s)、IP 字面量私网拒绝、DNS 全地址逐 IP 复检、重定向逐跳重围栏、跨域跳转剥鉴权头、15s/5MB 上限
service/kvclient.js 宿主桥（家规样板：端点自发现 + cap.kv 读写）
mcp/server.js      stdio MCP 七工具，返回纯 text
src/               React 面板四 Tab（对比/目录/接口/历史），全部经宿主 cap.http 通道（POST+JSON body）
```

**面板↔服务通道**：面板不直连服务端口，统一 `window.__POLARIS_HOST_INVOKE__ → router_dispatch → cap.http`（`http_capability.rs:20-27` 支持 POST+body+bodyType:json，已核实）。端口发现：kv `dfx.meta` → manifest 9877 回退。

## 七、护栏（静态断言守护）

- 全只读：service/mcp 无 writeFile/appendFile/unlink/rmdir（测试静态扫描）。
- 服务仅绑 127.0.0.1 + 回环双校验、无 CORS 头、业务错误 200+`{ok:false,error}`。
- 正文不落 kv：历史仅存元数据（kind/label/统计；URL 剥 query，文件只存名）。
- 围栏：http/https only；私网/回环/CGNAT/链路本地/元数据 IP 字面量拒绝；DNS 解析逐 IP 复检后才连接；重定向逐跳重围栏；跨 host 跳转剥 authorization/cookie；响应 ≤5MB、≤15s。
- 输入护栏：粘贴 ≤5MB、文件 ≤20MB、目录 ≤2 万条目、diff 输出 hunks ≤400 行、MCP 摘要截断。
- 无定时任务、无外部固定 URL 常量、无密钥管理面。

## 八、验收标准

1. core 离线单测 ≥40 断言全绿（Myers 正确性/共前后缀/全异回退、字级 diff、语义 diff 键序无关/数组重排对齐/嵌套/忽略路径/类型差异标注、目录对比、JSON 错误定位、路径 glob）。
2. 服务集成测试（假桥+真子进程）：text/files/dirs 全链路、护栏拒绝路径（私网 URL/非法 scheme/超大文件）、history 只存元数据。
3. MCP stdio 全链路七工具。
4. 真桥冒烟（真实宿主 kv + 真实服务子进程 + MCP 真子进程）。
5. `tsc --noEmit` strict + esbuild 构建通过。
6. 打包 sha256 → update.json/index.json 同步 → push → CDN 200 验证。

## 九、交付记录（2026-11-03 复活交付）

本插件由 2026-11-02 会话立项并基本建成，但未走完发布链即中断（目录未入 git）。2026-11-03 会话评估后复活交付，复活过程中发现并修复两个真 bug：

1. **致命：路由二次读体导致请求永久悬挂**（`service/main.js`）。根因：POST 分发处为所有 POST 路由统一 `await readJsonBody(req)` 一次（第 559 行区域），而 `diff_text/files/dirs/urls` 四个路由分支内又各自 `readJsonBody` 第二次——请求流被首次读取消费完毕后，第二次挂上的 `data`/`end` 监听永远不触发（Node 流 end 只发一次），Promise 永不 resolve，响应永远发不出去。实证：所有读体 POST 全部超时，不读体的 GET/404 秒回；仪器化调试日志捕获到同一请求 `readBody` 被调两次。修复：删四处二次读体，统一用分发处已读的 `body`，并在代码处留注释禁止回退。
2. **缺失：POST /api/settings 路由未实现**。测试与面板（`src/api.ts saveSettings`）都期望保存代理设置，但服务只有 GET。补齐：`parseProxyConfig` 校验（非法报错含 host:port）→ 内存权威 `settings.proxy` 更新 → kv 镜像 `dfx.settings`（镜像失败不阻塞）。
3. **加固：readBody 超限不再 `req.destroy()`**。原实现先 reject 再 destroy 套接字，导致错误 JSON 响应发不出去（客户端见连接重置）且 keep-alive 半截体毒化连接复用。改为：超限后停止缓冲、继续收流丢弃直至正常 end，响应干净返回、连接不毒化。

验证：离线单测 51/51、服务集成（真子进程 HTTP+MCP stdio）30/30、真桥冒烟（真实宿主 kv+自发现端口+MCP 真子进程）7/7，三层全绿后打包交付。sha256=9c54c019c254db66c7a32eef7db549390b26b46ca67d22976e130425838b1543。
