# 三层验证与真实桥冒烟配方

「能跑」不算完成，生产级 = 三层全绿。

## 第 1 层：离线单测（纯函数核心）

把所有可测逻辑抽到 `shared/<x>-core.js`（解析/规范化/合并/评分/清扫计划/告警机……），`test/run-tests.mjs` 用 node:assert 直测，**零依赖零 mock**：

```js
// test/run-tests.mjs —— node test/run-tests.mjs
import assert from 'node:assert'
const results = []
const t = (name, fn) => { try { fn(); results.push({ name, pass: true }) } catch (e) { results.push({ name, pass: false, detail: e.message }) } }
// ... 每个行为一条 t(...)
const bad = results.filter(r => !r.pass)
console.log(results.map(r => `${r.pass ? '✓' : '✗'} ${r.name}`) .join('\n'))
process.exit(bad.length ? 1 : 0)
```

六个已交付插件的单测经验：**坑都先在纯函数层暴露**（限频键维度、GBK 解码、chunk 边界）。改 shared core 必跑。

## 第 2 层：构建门

```bash
cd plugins/<id>
npm install          # esbuild + typescript + @types/react
npm run typecheck    # tsc --noEmit
npm run build        # esbuild → dist/panel.js
```

## 第 3 层：真实桥冒烟（test/smoke-real.mjs）

**对运行中的生产 Polaris 做全链路验证**（page-sentinel 11/11、pocket-host 11/11、clip-relay 11/11、data-ark 11/11 都这么跑的）：

```
前提：本机 Polaris 正在运行（anchor.json → config.json web.port 可达）
流程模板：
 1. 自发现真实桥端点（与服务同规则）
 2. 防误伤护栏：真实 kv 已有本插件业务键 → 拒跑
 3. 起本地 mock 端点（需要 HTTP 交互时）——注意 SSRF 守卫会拒 127.0.0.1，外部抓取用真实外网
 4. 经真实桥写测试数据（真实 cap.kv）
 5. spawn 真实服务进程（无 env 注入，传 '19870' 之类空闲端口 + appConfigDir）→ waitFor 心跳键
 6. 验证服务产出（写回的状态/结果键）
 7. spawn 真实 mcp/server.js（stdio JSON-RPC 直连）→ initialize → tools/list → tools/call 全闭环
 8. finally：杀进程 + 删光本插件前缀全部键 + 报告 N/N 通过
```

waitFor 模板：

```js
async function waitFor(fn, ms, step = 500, label = '') {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await new Promise(r => setTimeout(r, step)) }
  throw new Error(`冒烟超时：${label}`)
}
```

冒烟脚本的坑（clip-relay 实录）：从工具返回文本里正则提取 id 时 slice 边界错位 → 假超时；拿不准就结构化断言（先 kvGet 再比内容）。

## 主仓侧（涉及时）

动的是主仓而非插件时：`cargo check`（在 `src-tauri/` 下跑，仓库根没有 Cargo.toml）、改命令层/协议加 `cargo check --no-default-features --bin polaris-web --bin polaris-mcp`、前端 `pnpm exec tsc --noEmit`。本机 `cargo test --lib` 不可用（Tauri DLL 限制）。
