# 跨域治理三层方案（最重要的一课）

浏览器同源策略（CORS/混合内容/禁发头）是插件平台的第一杀手。**面板是浏览器环境，永远不要让它直接 fetch 外网。** 实战里验证过的三层解法，按优先级：

## 第 1 层：数据面 → cap.kv（跨端通用，零成本）

面板/MCP/服务三方共享的键值库，宿主代理转发，天然无跨域。**一切状态、配置、条目、结果都放 kv**，跨端（桌面/手机/Web）自动一致。

## 第 2 层：抓取面下沉服务原生 fetch（跨端通用的根治点）

服务是 node 进程，`fetch` 不受浏览器同源策略管。模式（clip-relay/page-sentinel 验证）：

```
面板写命令键/条目(kv) → 服务 tick 扫描 → 原生 fetch 外网 → 结果回写 kv → 面板轮询读
```

服务 fetch 必带 SSRF 守卫：只抓公网 http(s)，拒 `127.*`/`10.*`/`172.16-31.*`/`192.168.*`/`169.254.*`（云元数据）/`0.0.0.0`/localhost/`.local`/`file:`/`javascript:`——条目内容任何端都可写，不能让「推一条链接」变成对 localhost 的探测。完整守卫参考 clip-relay `service/lib.js` 的 `isFetchableUrl`（**改动必须保留**）。

Node 18+ fetch 坑：`res.body` 是 web ReadableStream **没有 `.on`**，须 `getReader()` 循环读，超限 `reader.cancel()`（见 `pitfalls`）。

## 第 3 层：面板走 cap.http 转发（桌面专用，有 Remote 陷阱）

宿主 RouterBus 的 `cap.http` 由后端 reqwest 转发，同样绕开 CORS/混合内容/禁发头：

```ts
// relay-devkit src/core/cap-http.js 验证过的契约
await invoke('router_dispatch', { req: { target: 'cap.http', payload: {
  action: 'request', method, url, headers, body, bodyType: 'text', timeoutMs: 20000,
}}})
// → { status, statusText, ok, contentType, headers, body, isBase64, url, timeMs }
```

**致命陷阱**：cap.http 对 **Remote 源（Web/手机浏览器）默认 deny**，桌面 Bootstrap 放行（实测记录）。所以 cap.http 只能当桌面加速路径，**跨端插件不能依赖它**——主路径永远是第 1/2 层。image-recognition/agnes/mimo-tts 的「面板 API 改道 cap.http」即此模式的批量应用。

## 决策表

| 需求 | 方案 |
|---|---|
| 读写状态/条目/结果 | cap.kv（三层通用） |
| 抓网页/调外部 API（跨端） | 服务原生 fetch + SSRF 守卫 |
| 抓网页/调外部 API（仅桌面可接受） | 面板 cap.http 转发 |
| 本地文件读取 | 面板 `<input type=file>` FileReader（本地文件不经 CORS）；或服务/MCP 进程按路径 fs 读 |
