# TLS 证书调试台（cert-lens）

把「SSL 握手失败」的排障从 openssl 语法地狱变成点一下的事。

## 它解决什么

| 场景 | 现状 | cert-lens |
|---|---|---|
| 「浏览器能开，curl/Node 报 UNABLE_TO_VERIFY_LEAF_SIGNATURE」 | 搜到 5 年前的帖子，手工 s_client 比对 | 粘贴链 → 自动拼装验签 → 指出缺哪级中间证书（附 AIA 下载地址） |
| 内网/自签端点证书检查 | 在线解码器够不到内网；openssl 语法地狱 | 本地桌面直接握手 127.0.0.1/10.x/私有域名，错误翻译成人话 |
| 证书到期引发停机（88% 公司两年内遭遇过） | 电子表格记到期日 | 端点盯守清单，≤30 天黄 / ≤7 天红，MCP 一句话巡检 |
| 私钥与证书是不是一对 | openssl x509 -noout -modulus 对比手抄 | 粘贴即比对（内存比较即弃，不落盘不落日志） |

## 三种用法

### 面板（四 Tab）
- **证书解析**：粘贴 PEM（整链一起粘、前后垃圾文本自动忽略）→ 全字段卡片 + 链拼装验签 + 可选私钥配对 + 可选 SAN 主机核对
- **连接诊断**：输入 `host:port`（支持 IPv6 `[::1]:443`、URL 整段粘贴）→ 真实 TLS 握手 → 协商协议/套件/ALPN、实际收到的链逐级体检、中文诊断卡（根因 + 修复建议）
- **到期盯守**：端点清单存 cap.kv，一键全检（并发 4），MCP `cert_expiry_check` 可复用
- **试金石**：fixture 证书矩阵 + 本地 hermetic TLS 服务器全链路自检

### AI（MCP 五工具）
```
cert_parse        解析证书/链/公钥 + 体检 + 配对（pem|pemFile + key|keyFile + host）
tls_probe         真实握手探测（target|host/port + serverName + timeoutMs）→ 链 + 诊断
tls_diagnose      错误码/浏览器报错/openssl 文本 → 中文根因 + 修复建议（19 类规则）
cert_expiry_check 批量到期速查（targets|file|useWatch）
cert_selftest     试金石
```
典型对话：「这个服务 SSL 报错打不开」→ AI 调 `tls_probe` 拿到结构化链与错误 → `tls_diagnose` 翻译根因 → 给出修复步骤。

### 服务 API（127.0.0.1:9885，token 鉴权）
`POST /api/parse | /api/probe | /api/diagnose | /api/watch/* | /api/selftest`，`GET /__health`。

## 安全与隐私口径

- 解析与配对全部内存完成：**私钥不落盘、不落日志、不落 kv**；日志只记尺寸/耗时/错误类型。
- 探测只发 TLS ClientHello 并立即断开，不发任何应用数据，无写副作用。
- 只绑 127.0.0.1；除 `__health` 外全部要求 token（面板经 cap.kv `cert-lens.meta` 获取）。
- **内网探测不设限**：本地桌面诊断工具对自身网络有完全权限——这正是相对在线检查工具（够不到内网）的核心差异。
- 错误诊断是纯离线规则表，不外联任何服务。

## 技术要点

- 零运行时依赖：node:crypto `X509Certificate` + `tls.connect`；签名算法用 ~40 行 mini-DER 解析器从 DER 取 OID（Node 不直接暴露 sigAlg）。
- 双段握手策略：严格段（`rejectUnauthorized:true`）拿系统信任库的真实校验结论；失败后宽松段补拿完整链作诊断素材。
- 链拼装验签 = 名字匹配（checkIssued）+ 验签（verify）双确认，杜绝同名假链。
- fixture 证书矩阵由 openssl 签发后入库（`test/fixtures/gen.mjs`），单测断言全部确定性；hermetic 测试用本地 TLS 服务器，不连外网。

## 测试

```
npm run build && npm run typecheck
npm test   # run-tests.mjs 36 断言 + service-verify 20 断言 + mcp-verify 17 断言
```

## 已知边界（如实）

- 不解析 CSR / CRL（检测到会明确提示），不支持加密私钥（带口令）配对。
- `cert_expiry_check` / 盯守只看端点当下返回的叶证书，不做 CT 日志全网发现（那是 KeyChest 类 SaaS 的领域）。
- 后台定时巡检未做：盯守全检在面板点按或 MCP 调用时触发（结果落 kv 供复用）。
- Windows 宿主下探测目标为 IP 时 SNI 留空（SNI 协议不允许 IP），可用 `serverName` 参数显式指定域名做 CDN 路由调试。
