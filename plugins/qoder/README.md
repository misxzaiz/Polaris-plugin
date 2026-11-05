# Qoder Engine for Polaris

Qoder AI CLI 引擎适配器（engine-v1 协议）。Qoder CLI 与 codebuddy 同用 claude-code
stream-json 事件流协议，adapter 与 codebuddy adapter 同构，差异仅在 CLI 参数名。

## 前置要求

1. **Node.js** >= 18
2. **Qoder CLI**：`npm install -g @qoder-ai/qodercli`
3. **登录 Qoder**：`qodercli login`（浏览器 OAuth，必须人工完成——CLI 无非交互登录通道）

## 安装（开发联调）

```cmd
mklink /J "%APPDATA%\Polaris\plugins\qoder" "D:\space\base\Polaris-plugin\plugins\qoder"
```

并在 `%APPDATA%\Polaris\plugins\state.json` 加条目：

```json
"qoder": { "enabled": true, "uiEnabled": true, "mcpEnabled": true, "devLink": { "sourcePath": "\\\\?\\D:\\space\\base\\Polaris-plugin\\plugins\\qoder" } }
```

## 与 codebuddy 的差异点

| 项 | codebuddy | qoder |
|---|---|---|
| 思考力度参数 | `--effort` | `--reasoning-effort` |
| 思考模式 | 无 | `--thinking <auto\|adaptive\|enabled\|disabled>`（独有，暂未透传） |
| 权限值名 | camelCase（`acceptEdits`） | snake_case（`accept_edits`） |
| plan 权限模式 | 支持 | 无，降级 `default` |
| 模型目录 | manifest 声明 17 个 | **登录后 `--list-models` 补**（需账号） |
| 登录 | 国内站点验证码 | `qodercli login` 浏览器 OAuth |

## sessionConfig 声明

manifest `contributes.engines[].sessionConfig` 声明选择器与选项值——宿主零改动：
- selectors：agent / model / effort / permission / profile
- effortOptions：不设置 / low / medium / high（对应 `--reasoning-effort`）
- permissionOptions：不设置 / default / auto / acceptEdits / dontAsk / bypassPermissions
  （adapter 侧映射为 qoder 的 snake_case 值）

## 测试

```bash
node tests/adapter-smoke.mjs
```

假 CLI 冒烟 16 断言：帧契约全序 / snake_case 权限映射 / --reasoning-effort（断言
不出现 --effort）/ agent 透传 / stdin prompt / interrupt 树杀无孤儿 / 缺省权限。

## 登录后待办

- [ ] `qodercli --list-models` 拿权威模型清单 → 补 manifest `models` 数组
- [ ] 真机 E2E：选 Qoder 引擎发消息验证流式/思考/用量渲染
- [ ] 评估 `--thinking` 模式透传（可作为 advancedOptions 独有参数）
