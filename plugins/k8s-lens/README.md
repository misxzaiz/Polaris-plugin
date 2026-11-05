# K8s 清单体检台 k8s-lens —— apply 前一次本地体检

> 把「清单错误 → apply 被拒 / 带病上线 → 集群里排错」变成 **apply 前一次本地体检**。
> 不需要装 kube-linter / kube-score 二进制，不需要把清单贴给第三方网页，也不需要集群——
> 粘贴或扫目录，行级发现 + 中文修复建议 + 0-10 评分，纯本地零外联。

## 为什么要有 K8s 清单体检台

- 清单错误的发现方式是 **apply 报错甚至带病上线后**：`selector does not match template labels`、
  `labels 值不能是数字`、`Job restartPolicy 不能是 Always` 这类错误 100% 可以在 apply 前静态检出。
- 事实标准工具（[kube-linter](https://github.com/stackrox/kube-linter)、
  [kube-score](https://github.com/zegl/kube-score)）是 CLI 二进制，安装有摩擦且无 AI 解读；
  网页工具要把清单贴给第三方。知名同类工具 [datree](https://github.com/datreeio/datree) 已于
  2024-06 归档，「轻量、免安装、可解释」的供给出现真空。
- `apps/v1beta1`、`extensions/v1beta1`、`policy/v1beta1`（PSP）等 API 在 1.16/1.22/1.25 批次
  已被集群移除，老清单 apply 即失败——没有工具在 apply 前本地提示。
- privileged / hostPID / hostPath / 明文密钥是真实的安全红线模式，人工 review 极易漏。

## 核心能力（51 条规则）

| 类别 | 覆盖 |
|---|---|
| 结构错误（error，apply 即失败） | 缺 apiVersion/kind/metadata.name、kind↔apiVersion 错配、**已移除的弃用 API**（apps/v1beta*、extensions/v1beta1、policy/v1beta1、autoscaling/v2beta*、networking.k8s.io/v1beta1、batch/v1beta1 等，附迁移目标）、metadata.name 违反 RFC1123、**labels/annotations 值非字符串**（js-yaml 把 `version: 1` 读成数字——高频坑） |
| 安全红线（error/warn） | privileged、hostNetwork/hostPID/hostIPC、hostPath 卷、**明文密钥**（按变量名红旗识别；`$(VAR)` 引用与占位值降 info）、危险 capability（SYS_ADMIN/NET_RAW 等）、allowPrivilegeEscalation / runAsNonRoot（warn）、readOnlyRootFilesystem / seccompProfile（info） |
| 可靠性 | 缺资源 limits（Job/CronJob 降 info）、requests>limits（error）、缺 liveness/readiness 探针、latest 镜像、Job restartPolicy 非法、CronJob **cron 表达式校验**（5 段/@daily 简写/CRON_TZ 时区/英文名/7=0）、concurrencyPolicy 取值、单副本与 Recreate 策略提示 |
| 跨资源一致性 | **selector ↔ template.labels 精确比对**（缺键/值不等分列）、Service selector 匹配不到 workload、Service targetPort ↔ 容器 containerPort 对账（支持按名字）、ConfigMap/Secret/PVC 引用完整性（本批缺失 info，optional 标注）、Ingress v1 backend 结构（v1beta1 旧写法检出）、Ingress ↔ Service 存在性与端口对账、StatefulSet headless Service 缺失 |
| 体验 | 多文档 `---` 分割（全文行号）、**行级定位**（纯文本行索引器，解析树发现也能落行）、Helm 模板自动跳过、CRD 只做结构层检查不误报、0-10 评分（10 − error×2 − warn×0.7 − info×0.2） |

## 快速开始

1. 插件中心安装「K8s 清单体检台」→ 左侧 ActivityBar 出现 🚢 面板。
2. 粘贴清单（多文档用 `---` 分隔）→ 点「体检」。
3. 或直接对 AI 说：

```
用 K8s 清单体检台扫描 D:\my-project\deploy，apply 前给我过一遍
```

4. 面板「规则目录」可看全部 51 条规则与修复建议。

## 与 AI 的对话约定（MCP 工具）

| 工具 | 用途 |
|---|---|
| `k8s_lint` | 体检一段清单文本（多文档支持；非清单文本如实拒绝） |
| `k8s_scan` | 只读扫描目录（*.yml\|yaml，自动跳过非清单 YAML 与 Helm 模板），逐文件评分 + 汇总 |
| `k8s_rules` | 规则目录（回答「你们检查什么」） |
| `k8s_explain` | 按规则 id 解释单条规则（含义 + 修复） |

## 架构

```
┌──────────── 面板（粘贴 → 体检 → 行级发现 + 规则目录）────────────┐
│  js-yaml（esbuild 打包进 bundle）；发现按文档分组表格             │
├────────────────────────────────────────────────────────────────┤
│ shared/k8s-core.js 纯函数核心（单一权威，运行时零依赖）           │
│  splitDocs 多文档分割（全文行号偏移）                             │
│  buildLineIndex 纯文本行索引器（键路径→行号+父链；块标量/注释/     │
│  序列 flush·缩进双式/行内首键；解析树发现的行级定位补偿）          │
│  结构校验（kind↔apiVersion 表 + 弃用 API + RFC1123）             │
│  PodSpec 容器规则（安全/可靠性；Pod/Deployment/Job/CronJob 路径   │
│  自适应，init 容器与批处理豁免）                                  │
│  crossCheck 跨资源两遍检查（selector/引用/端口/Ingress）          │
│  K8s Quantity 数量比较 / cron 校验 / 评分渲染                     │
├────────────────────────────────────────────────────────────────┤
│ mcp/server.js（esbuild bundle，stdio JSON-RPC；js-yaml 内置）     │
│  AI 工具层：k8s_lint / k8s_scan / k8s_rules / k8s_explain        │
│  scan 只读（512KB/文件、跳过 .git/node_modules、文件数护栏）       │
└────────────────────────────────────────────────────────────────┘
```

**单一权威**：面板与 MCP 共用 `shared/k8s-core.js`，同一清单两边结论永远一致。
**零 kv / 零宿主依赖 / 零集群**：无状态体检，MCP server 无宿主时照常可用。

## 开发与验证

```bash
npm install
npm run typecheck        # tsc --noEmit（strict）
npm run build            # esbuild → dist/panel.js + mcp/server.js（bundle）
node test/run-tests.mjs  # 离线单测 128 断言（13 组：行索引/逐规则正反例/行号定位/
                         #   干净夹具零误报/多文档/Helm/语法/评分）
node test/mcp-verify.mjs # MCP 真桥冒烟 19 断言（真实 stdio 子进程全链路 + 临时夹具扫描）
```

实测锚点：Kubernetes 官方文档 `nginx-deployment` 示例 = **5.9/10（0 error · 5 warn · 3 info）**——
结构零 error（示例确实合法），8 项最佳实践缺口（探针/limits/安全上下文）全部行级检出，
与 kube-score 对官方示例的行为一致。

## 已知边界（如实声明）

- **不校验未知字段拼写**（完整 schema 校验需 kubeconform 级 schema 表，超出离线子集规模）。
- **不连集群**：跨资源检查只对「本批清单内」判定；引用外部资源降 info 提示（不误报）。
- **Helm 模板不解析**：检测到 `{{ }}` 即跳过该文档（模板应在渲染后体检）。
- CRD/自定义 API 只做结构层检查（info 说明）；规则表以 2026-11（≈1.32/1.33）时点为准。
- 明文密钥按变量名红旗识别（PASSWORD/SECRET/TOKEN/KEY 类），语义级判断不做；`$(VAR)`
  运行时引用与占位值降 info。
- 行号由纯文本行索引定位（尽力而为）：行索引失败时回退文档起始行，不影响规则正确性。
