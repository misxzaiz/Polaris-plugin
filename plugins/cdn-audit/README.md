# CDN 体检台（cdn-audit）

把「我引用的公共库还是不是真身、从我的网络哪个镜像安全可用、CDN 边缘什么时候更新到最新」变成一次 30 秒的本机核验。

> 背景：2024-06 polyfill.io/BootCDN/Bootcss/Staticfile 供应链投毒波及数千万网站——「CDN 分发内容 ≠ 官方内容」必须可验证；而镜像可用性因网因时而异（jsDelivr 主域在大陆长期被污染），**只有跑在本机的探测器说真话**。在线工具做不到这两件事，这正是本插件的存在理由。

## 四个核心动作

### ① 核验（资源完整性）
- 输入资源 URL 列表，或一个网页 URL / 粘贴 HTML（自动提取外部 script/link）
- 逐个抓取实际内容，与官方发布内容哈希比对：
  - **npm 系双源**：npm tarball（真权威，registry.npmjs.org 元数据 dist.tarball 解包比对）+ jsDelivr data API 自报口径（structure=flat 逐文件 sha256）
  - **cdnjs 系**：cdnjs 官方 API 逐文件 sha512-SRI
- 篡改 → 🚨 红榜；CDN 现场生成的 min 变体（不在官方包内）→ ⚠️ 诚实标注「无法权威核验」，绝不假装
- 顺带审计页面已有的 integrity 属性（错值/过期即红榜）

### ② 镜像矩阵
对同一文件探测 jsDelivr（主域/gcore/testingcf/fastly）、unpkg、npmmirror，以及 cdnjs 系跨族镜像（cdnjs/BootCDN/Staticfile/Baomitu）：HTTP 状态、延迟、大小、内容一致性——**从你的网络**回答「哪个镜像安全可用」。

### ③ SRI 生成
生成带 `integrity`（sha384/sha512）与 `crossorigin="anonymous"` 的 `<script>`/`<link>` 替换标签。内容与官方一致时哈希即官方哈希；不一致时明确警告**仅供取证，切勿引用**。

### ④ 传播观测（本生态自用）
对「源端 vs CDN 边缘」两个 URL 按间隔哈希对账（如 raw.githubusercontent ↔ cdn.jsdelivr.net/gh/...），一致即自动判完成——插件发版后「边缘何时真正更新」不再靠盲等。附带 jsDelivr purge 单发 + 冷却防呆（连发必被静默限流，实测 39~43 分钟）。

## AI 工具（MCP 8 个）

`cda_check`（核验）/ `cda_mirror`（镜像矩阵）/ `cda_sri`（SRI 标签）/ `cda_watch` + `cda_watch_status`（传播观测）/ `cda_report` / `cda_history` / `cda_selftest`（内置试金石自检）。

对话示例：
- 「帮我查一下页面里这几个 CDN 脚本有没有被投毒」（cda_check）
- 「jquery 3.7.1 从我现在的网络用哪个镜像最稳」（cda_mirror）
- 「刚 push 了 index.json，盯一下 jsDelivr 什么时候同步」（cda_watch）

## 安全设计

- 全部出网经 SSRF 围栏：拒绝内嵌凭据、私网/回环/链路本地/CGNAT/云元数据 IP、DNS 逐 IP 复检防 rebinding、重定向逐跳复检跨源剥鉴权
- 服务只绑 127.0.0.1；面板经宿主 cap.http 通道转发（无跨域面）
- kv 投影只存哈希与元数据，**不落抓取正文**
- purge 单发 + 冷却默认 10 分钟（防呆闸，不是限流共犯）
- 观测（watch）目标同样过围栏；服务重启后 running 观测如实标注 interrupted，不假装仍在跑

## 已知边界

- 非 npm/cdnjs 系资源（自建 CDN、非库文件）无权威哈希源 → 如实判「无法核验」并给出可达性与跨源一致性参考；gh/ 分发请用传播观测对照源端
- jsDelivr 对包内不存在的 `.min.js` 路径会现场生成压缩版 → 判「CDN 现场生成」而非「篡改」（不制造假阳性）
- cdnjs 系跨族矩阵依赖「npm 包名 = cdnjs 库名且文件名同名」的 best-effort 映射，未收录时跳过并说明
- npm tarball 获取设 30MB 上限（超限包自动降级为 jsDelivr 口径单源，报告中如实标注）

## 本地开发

```bash
npm install
npm run build        # esbuild 面板
npm run typecheck    # tsc --noEmit
node test/run-tests.mjs        # 离线单测（30 项）
node test/service-tests.mjs    # 集成（REST + MCP + 内存假桥，17 项）
CDNAUDIT_SMOKE=1 node test/smoke-real.mjs  # 真实网络冒烟（需外网）
```
