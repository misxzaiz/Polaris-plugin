# zcode-adapter — ZCode 方言适配器（通用适配器能力参考实现）

第一个基于 Polaris「通用方言适配器能力」实现的适配器插件：
让 Polaris 能发现并安装 ZCode（`.zcode-plugin/plugin.json`）格式的插件。

- 宿主侧规范：`Polaris/plans/plugin-adapter-capability-spec.md`
- 字段映射表：`Polaris/plans/plugin-system-zcode-compat-and-ai-ops-spec.md` §2.2
- 铁律：适配器只有**翻译权**，准入校验（schema 单源 / idPrefix 白名单 / deny_unknown_fields）由宿主独占。

## 工具

| 工具 | 输入 | 行为 |
|---|---|---|
| `discover` | `{ rootPath }` | 扫描一层深度内的 `.zcode-plugin/plugin.json`，返回候选（含 manifest 原文） |
| `translate` | `{ manifestPath \|\| manifest }` | 翻译为 Polaris manifest 草稿 + 逐条显式降级诊断 |

## 冒烟测试

```bash
node plugins/zcode-adapter/test/smoke.mjs
```

## 已知 L1 限制（显式降级，不静默）

- `mcpServers.*.env` / `cwd` 不透传（待宿主 env 注水，Polaris 阶段 2.5）
- `ui.surfaces[].resourceUri` 页面不渲染（待 L2 MCP Apps 沙箱）
- `userConfig` 不支持（待 L2 宿主管配置表单）
