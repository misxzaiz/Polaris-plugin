# bundle-lens 包体积透视台

把「这个前端包为什么这么大、谁占的、有没有重复依赖」从装插件改构建配置变成一次 60 秒的本地透视。

## 它做什么

指向任意构建产物目录（vite / webpack / esbuild / rollup 通吃，**零配置零侵入**——不装 bundler 插件、不改构建脚本）：

1. **字节级归因**：解析 sourcemap（VLQ 解码 + UTF-16 列 → UTF-8 字节换算），算出每个 chunk 里每个源文件、每个 npm 包占多少字节。
2. **包分组**：npm / pnpm（`.pnpm/<pkg>@<ver>` 段提取真实版本）/ yarn 嵌套 / webpack:// 前缀路径全部归一；vendor vs 应用代码占比一目了然。
3. **重复三连检**（竞品公认弱项，见 webpack-bundle-analyzer#570）：
   - 同包多份独立安装 / 多版本（dedupe 收敛的直接依据）
   - 同一源文件打进多个 chunk
   - 不同路径完全相同内容（sourcesContent 哈希）
4. **确定性建议**：moment 全量 locale、core-js 全量 polyfill、单 chunk 过大混合多包、未归因占比过高等——每条带证据，不靠 AI 幻觉。
5. **treemap 面积图**：包 Top40 + 应用代码一张图，多份安装标红。
6. **扫描历史自动 diff**：对同一目录第二次扫描起，自动与上次逐包对比——优化前后验收必备。
7. **AI 经 MCP 八工具对话式透视**：`bundle_scan / report / packages / duplicates / chunks / diff / runs / selftest`，AI 读真实字节而不是编造体积。

## 隐私与安全

- sourcemap 含源码——**全程不出本机**：服务只读目标目录，零网络出站（唯一 HTTP 是 127.0.0.1 回环 + 宿主 kv 桥）。
- 服务仅监听 127.0.0.1 + Bearer token（timingSafe 比对），不带 CORS 头。
- 只读扫描，不写目标目录；selftest 只写 `os.tmpdir()` 且 finally 清理。
- 不使用 kv list（宿主已知该动作会楔死 dispatch 通道）。

## 已知边界（诚实口径）

- **没开 sourcemap 的产物只能做文件级体积统计**（vite 默认关：`build: { sourcemap: true }` 一行开启；webpack: `devtool: 'source-map'`）——报告会明示 no-map chunk 数并给出开启提示，不伪造归因。
- `mapped + unmapped = 文件字节` 守恒；换行符、无映射段、段间隙如实计入 unmapped。
- sourcesContent 总量超预算（80MB）时内容查重部分跳过并在警告中明示。
- Web(https) 部署模式下浏览器拦 `http://127.0.0.1` 混合内容——桌面 / 手机 WebView 正常（与 repo-lens / dep-probe / stream-desk 同款边界）。

## 架构（repo-lens 同款三层）

```
面板(dist/panel.js) ──127.0.0.1 直连+Bearer──▶ service/main.js(9880)
MCP(mcp/server.js) ──kv 读 bundlelens.meta 拿 port/token──▶ 同上
service ──kvclient→宿主 /api/router-dispatch→cap.kv──▶ 投影（三端同看）
分析引擎 shared/core.js：纯逻辑零依赖，selftest 内置全链路断言
```

kv 键空间（`bundlelens.` 前缀）：`meta`（心跳 60s）/ `settings` / `runs` / `latest` / `report.<runId>`。

## 验证

- 离线单测 32 项（`npm test`）：VLQ 往返 / UTF-16 列→字节表（多字节+代理对）/ sections 段式 map / 路径归一 / pnpm 版本提取 / treemap 面积守恒 / diff 语义 / 建议规则 / mock bridge 服务集成 / MCP stdio 八工具全链路 / **esbuild 现场打包真产物验证**。
- 真桥冒烟（`BUNDLELENS_REAL=1`）：真实宿主 cap.kv + 真实扫描。
- 真实战果（Polaris 主仓 dist，`vite build --sourcemap` 后 1.2s 扫完）：检出 katex×2 份（根 + mermaid 嵌套）、marked×3 份（根 + mermaid + @codemirror/lsp-client 嵌套），经 node_modules 实盘核对**零误报**。

## 开发

```bash
npm install
npm run typecheck   # tsc --noEmit
npm run build       # esbuild → dist/panel.js
npm test            # 离线全量
node scripts/pack.js plugins/bundle-lens   # 打包 + sha256
```
