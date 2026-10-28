# PLAN-model-select — ZCode 引擎模型选择（套餐 + 自建）

> 状态基准：2026-10-28，v0.1.3 已实施。单测 16/16、引擎集成冒烟 16/16、面板冒烟 6/6 全绿。
> 上游规划：`PLAN-next-step-v2.md` §2.2「模型切换（全力争取）」、`PLAN-engine-plugin.md` §2「模型覆盖（需实测 ZCode 支持度）」——本文补齐其全部未验证项。

## 1. 问题

ZCode 的默认模型是全局/工作区级的（`~/.zcode/v2/provider_config.json` 的 `providerOrder` 决定，自建供应商排第一时桥接会话全部落自建模型）。Polaris 侧此前没有任何通道把「模型选择」送进 ZCode 引擎；且 ZCode 桌面账号的套餐 provider（`account:bigmodel-start-plan`）**不在**桥自建 app-server 的模型注册表里（账号态由桌面 Host 持有）。

## 2. 协议实测定案（逆向 zcode.cjs + 活体探针，替代 PLAN 文档的全部「未验证」项）

| 项 | 结论 |
|---|---|
| `session/create` 初始模型 | 支持 `{providerId, modelId, options?{reasoningLevel?}}` 严格对象；**无效模型会炸整个 create** → 不采用 |
| `session/setModel` | `{sessionId, model, expectedRevision?}`；expectedRevision 可选无需跟踪；`persistAsWorkspaceLastUsed` 默认 true 会持久化成工作区默认 → 桥必须显式 false；成功广播 `model_changed` |
| `session/send` 模型覆盖 | **不支持**（PLAN 文档原猜测方向错误） |
| 列模型 RPC | 协议层没有（模型目录是 app-server 内部 API）；`provider/refreshRegistry` 只刷 builtin/自定义，不引入账号 provider |
| 账号 provider 注入 | `provider/updateAccountConfig` 通道存在且 standalone 运行时接受推送，但仅限 `zhipu-account` 型 access 且模型不可经推送解析 → 不可用 |
| reasoningLevel | GLM-5.3/GLM-5.3-Flash/deepseek-v4-flash 都必须带档位；`high` 实测可用；缺档位/档位不支持都有明确错误文案 → 阶梯试错可行 |
| bigmodel anthropic 端点鉴权 | 强制 **V4 客户端签名**（与 access 类型无关，按端点触发）；签名器解析 `id.secret`/JWT 格式密钥；自建端点握手失败自动 fail-open 明发（localhost 代理实测通） |
| credentials.json 套餐密钥 | `enc:v1:` 加密静态存储（桌面内存解密），桥不可用 → **套餐模型需用户自备控制台签发的套餐 API Key** |

## 3. 方案（已实施）

**Profile 即 provider 规格**：Polaris Profile 的 `api_key/base_url/model` 由宿主经 env 注入引擎（`ANTHROPIC_API_KEY/ANTHROPIC_BASE_URL/ANTHROPIC_MODEL`，`ai_chat_core.rs` Custom 引擎分支既有管道，零宿主改动），engine.js 据此生成**插件私有** personal provider 配置（真实配置深合并 + profile 条目，不碰用户真实 `provider_config.json`），经协议支持的 `ZCODE_PERSONAL_PROVIDER_CONFIG_FILE` env 注入自持 app-server。套餐 Key（bigmodel 控制台签发）与自建端点同一条路。每轮 prompt 幂等 re-assert `session/setModel`（persist=false），会话中途换模型下一轮生效；失败一律降级 ZCode 默认，不中断轮次。

```
Polaris 主对话（引擎 zcode + Profile + 模型下拉）
  │ 宿主 env 注入（既有管道）
  ▼
engine.js（自持 app-server 子进程，退出回收）
  │ 1. 生成私有 personal 配置 = 真实配置 ⊕ profile provider（api-key 型）
  │ 2. create → resume → subscribe → setModel(阶梯) → send → drain
  ▼
ZCode app-server → 套餐端点（V4 签名）或自建端点（fail-open 明发）
```

- providerId 解析优先级：`ZCODE_MODEL_PROVIDER`（Profile custom_env 显式）> Profile 模式固定 `polaris-profile` > 观察目录 > 缺省继承 ZCode 默认。
- 档位阶梯：目录沉淀 > `ZCODE_REASONING_LEVEL` > `high`→`medium`→`low`；先无档位直试。
- 观察目录 `<session-dir>/_zcode_model_catalog.json`：`{providers:{modelId→providerId}, levels:{modelId→level}}`，从事件流 + 阶梯试错沉淀，跨进程复用。

## 4. 用户一次性配置（唯一手工步骤）

建一个供应商 Profile（targetEngines 勾选 zcode）：
- **套餐模型**：api_key = BigModel 控制台（coding-plan 页）签发的套餐 API Key；base_url = `https://open.bigmodel.cn/api/anthropic`；模型 GLM-5.3 / GLM-5.3-Flash（model_options）。
- **自建端点**：照现有 Profile 填（如 localhost 代理）。
- 可选 custom_env：`ZCODE_REASONING_LEVEL`（档位偏好）、`ZCODE_MODEL_PROVIDER`（强制 providerId）、`ZCODE_MODEL`（强制模型名）。
- 桌面 OAuth 登录的套餐账号密钥是 `enc:v1:` 加密态，**不能**直接用——必须控制台签发 Key（与桌面「手动填 Coding Plan Key」官方流程同通道）。

## 5. 测试

```bash
node plugins/zcode-bridge/test/unit-model-select.cjs        # 16/16 纯函数
node plugins/zcode-bridge/test/integration-engine-model.cjs # 16/16 引擎级（自建全链路/续聊/无模型回归）
node plugins/zcode-bridge/test/smoke.cjs                    # 6/6 面板 MCP 回归
```

探针脚本（协议取证，保留备查）：`probe-set-model.cjs`（基线）、`probe-registry.cjs`（注册表通道判定）、`probe-account-push.cjs`（账号推送排除）、`probe-personal-plan.cjs`（私有配置定案）、`probe-glm-debug.cjs`（签名错误取证）。

## 6. 边界与后续

- **套餐 Key 到期/轮换**：桌面 OAuth 密钥由 Host 定期轮换，Profile 内的静态 Key 需用户自行维护；后续可在面板加「套餐 Key 健康检查」（对端点发一次最小请求）。
- **面板路径模型切换**：同一 setModel 逻辑可在 9862 服务复用（`doCreate` 透传 model），本期未做。
- **ZCODE_PROVIDER_CONFIG 版本 glob 写死 3.16.3**：ZCode 升级后 builtin 路径探测失效，app-server 自动回退内置 builtin（已验证不致启动失败），仅模板面变窄；后续可改扫描全部版本目录。
- **thoughtLevel**（`session/setThoughtLevel`）未接入，与 reasoningLevel 独立，后续可经 Profile custom_env 透传。
