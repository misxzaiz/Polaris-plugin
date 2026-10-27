# 实测坑总表（文档没写的都在这）

一条一个真实故事，全部 2026-10 实测。写新插件前扫一遍能省一整天。

## 环境与通道

| 坑 | 真相 | 对策 |
|---|---|---|
| 服务进程零环境变量注入 | 文档说有 `POLARIS_HOST/PORT/TOKEN`，实测不存在 | kvclient 自发现（anchor→config→扫 25 端口） |
| `plugin_service_*` 命令已删 | main.tsx HOST_INVOKE_ALLOWLIST 还有残留条目，会被误导 | 面板走 `router_dispatch → cap.pluginServiceManager` |
| 宿主不收集服务 stdout/stderr | 文档的 `__POLARIS_PLUGIN_SERVICES__` 日志 API 未实现 | 自落盘 `<appConfigDir>/<id>.log` + 512KB 轮转 |
| `process.send({type:'ready'})` 无消费者 | 文档建议的 ready 信令没人听 | http 型靠健康端点；启动完成写 meta 心跳 |
| cap.http 对 Remote 源默认 deny | 桌面 Bootstrap 放行，Web/手机拒——「桌面好的手机不行」的经典根因 | 数据面 cap.kv，抓取面下沉服务 |
| 面板 React 必须 external | 文档另一处说「React 打进去」——错，白屏 Invalid hook call | `--external:react --external:react/jsx-runtime` |

## Node 服务层

| 坑 | 真相 | 对策 |
|---|---|---|
| Node 18+ fetch body 没有 `.on` | 是 web ReadableStream，不是 stream | `getReader()` 循环读；超限 `reader.cancel()` |
| Promise executor 里不能 await | `new Promise(async (resolve) => ...)` 吞异常 | fetchPage 整体 async，executor 只做同步包装 |
| 清扫只靠周期会失守 | 高压场景 60s 内无响应 | tick 里检测超限**立即触发**清扫（15s 节流防空转） |
| 限频键不含区分维度 | pocket-host：限频键没含 mount，同 tick 双盘告警互吞 | 限频/告警键 = `<维度全量组合>`，单测覆盖此坑 |
| Windows GBK 输出 | tasklist/netstat 中文系统输出 GBK | `TextDecoder('gbk')` 解码 |
| 冒烟提取 id 的 slice 边界 | 从文本正则提取再 slice 错位 → 假超时 | 结构化断言（kvGet 回读比对） |

## 数据层

| 坑 | 真相 | 对策 |
|---|---|---|
| cap.kv list 返回全局所有键 | 无前缀过滤参数，跨插件共享 | 前缀铁律 + 键数纪律（分块） |
| kv 无 CAS | 后写覆盖先写 | 单写者 + 命令键先删后做 |
| get 可能撞已删键 | list 与 get 之间数据可变 | 所有 get `.catch(() => null)` 容忍 null |
| 大对象整写放大 | 每改一条重写全量 | 分块 + 脏缓冲合并刷盘（bookmark-dig 模式） |

## 发布层

| 坑 | 真相 | 对策 |
|---|---|---|
| publish 脚本不新增条目 | index.json 没有该 id 时「跳过 sha 更新」 | 先手动加条目再跑脚本 |
| 重发改成 @tag URL | 脚本把 downloadUrl 改 `@<tag>`，不推 tag 就 404 | 改回 @main + 重算 sha |
| zip 每次重打 sha 变 | Compress-Archive 带时间戳 | 以最后一次为准 |
| index.json 并发覆盖 | 另一会话用旧基座整文件重写，抹掉别人未提交条目 | 改前重读现文件，只动自己的条目 |
| MCP schema 更新不生效 | AI 侧缓存的工具列表 | 重启应用/重连 MCP |

## 主仓侧（涉及时）

| 坑 | 真相 | 对策 |
|---|---|---|
| `cargo test --lib` 不可用 | Tauri DLL 启动限制 | `cargo check` + 前端 vitest 代替 |
| cargo check 找不到 Cargo.toml | 仓库根没有，在 `src-tauri/` 下跑 | `cd src-tauri && cargo check` |
| 命令门控双方向 | 漏 gate 或辅助函数引用被门控导入都会挂 | 改命令层必跑 `cargo check --no-default-features --bin polaris-web --bin polaris-mcp` |
