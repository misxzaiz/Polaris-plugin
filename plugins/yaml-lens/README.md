# yaml-lens — YAML 调试台

粘贴 YAML → 三件事（纯本地零外联）：

1. **解析预览**：js-yaml 4.1.0（YAML 1.2 core 语义）多文档解析、锚点/别名/合并键清单、JSON 预览；解析失败给 1 基行列 + 中文修复提示。
2. **坑检测**：19 条静态规则（与解析是两道独立闸）——跨实现语义漂移（Norway problem / 前导零八进制 / 六十进制）、数据变形（版本号塌陷、大整数精度丢失、时间戳漂移、注释吞值、空值 null）、书写陷阱（Tab 缩进、智能引号、重复键、键后缺空格、保留字符）。每条给严重度 / 行列 / 跨实现行为对照 / 修复建议。
3. **转换**：YAML→JSON、JSON→YAML（不折行 `lineWidth:-1`、`noRefs` 展开共享引用、可选排序键）。

## MCP 工具（前缀 `yaml_lens_`）

| 工具 | 说明 |
|---|---|
| `yaml_lens_parse` | 解析 + 每文档 JSON 预览 + 锚点别名清单；失败报行列与原因 |
| `yaml_lens_lint` | 坑检测全表（严重度/位置/规则/说明/修复）+ 解析状态 |
| `yaml_lens_to_json` | YAML→JSON（单文档对象 / 多文档数组；.inf/.nan/Date 字符串化不静默变 null） |
| `yaml_lens_to_yaml` | JSON→YAML（不折行 / noRefs / sortKeys 可选） |

## 结构

- `shared/yaml-core.js` — 扫描引擎（零依赖纯函数，MCP 与面板共用单一权威）
- `mcp/server-src.js` → esbuild bundle 到 `mcp/server.js`（js-yaml 打入，发布 zip 零 node_modules）
- `src/Panel.tsx` — 面板三视图
- `test/` — core 行为锁与规则断言 + MCP 协议离线验证 + 面板 SSR 渲染断言

## 开发

```
npm install
npm run build     # 先 MCP 后面板
npm run typecheck
npm test          # 三段冒烟全过才算交付
```

## 边界（如实声明）

不做 k8s/Actions 等领域 schema 校验（只做语言层诊断）；跨行 flow 内重复键不静态检测（解析器抛错兜底）；跨行引用续行只做注释/智能引号检查；不做 YAML Formatter 重排美化。
