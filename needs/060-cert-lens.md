---
id: "060"
title: TLS 证书调试台（cert-lens）：证书解析 + 真实握手诊断 + 到期盯守 + AI 自证工具
status: delivered
priority: high
tags: [tls, cert, security, debugging, network, developer-tools]
origin: zcode
created: 2026-11-06
updated: 2026-11-06
spec: ""
delivered: 2026-11-06 交付：plugins/cert-lens（shared 三引擎 certmodel/audit/diagnose + service probe/logic/selftest/main + mcp 五工具 + 面板四 Tab）。三层验证全绿：离线单测 36 断言（fixture 矩阵：正常/过期/自签/SAN不匹配/RSA-1024/SHA-1/三级链/乱序链/配对）+ 真 service 冒烟 20 断言 + 真 MCP 子进程 17 断言（含真实公网 api.github.com:443 探测通过）；typecheck 过；panel.js 35.6KB。零运行时依赖（node:crypto X509Certificate + tls.connect，签名算法用 mini-DER 解析器自取 OID）。MCP 工具实定名：cert_parse/tls_probe/tls_diagnose/cert_expiry_check/cert_selftest（cert_key_match 并入 cert_parse 的 key 参数）。选型文档 docs/cert-lens-selection.md（88 分，市场证据 Keyfactor/Ponemon 88% 公司证书过期停机 + SC-081 有效期 200→47 天时间表 + 内网检查真空）。
---
## 一句话

面向开发者/运维的本地 TLS 证书调试台：粘贴证书（PEM）全字段解析与链排序、对任意可达端点（含内网/自签，在线工具到不了的地方）做真实 TLS 握手诊断并中文翻译错误根因、端点到期盯守分色告警、MCP 工具让 AI 遇到 SSL 报错时直接自证。核心动作是「诊断/变换」，非记录——过方向硬闸。

## 目标（做什么）

- ①证书解析：PEM 证书/证书链/公钥 → 字段全视图（Subject/Issuer/SAN/有效期/密钥算法与强度/签名算法/指纹/扩展/是否自签）+ 链排序修复建议 + 证书-私钥配对检查；②连接诊断：host:port 真实 TLS 握手（Node tls.connect）→ 协商协议/密码套件/证书链完整性验签/到期倒计时 + 常见 TLS 错误码→中文根因与修复建议映射；③到期盯守：端点清单全检 + 倒计时排序分色（>30d/<30d/<7d/已过期）；④MCP 工具：cert_parse / tls_probe / tls_diagnose / cert_expiry_check / cert_key_match。

## 边界（明确不做什么）

- 不做证书签发/CSR 生成；不做 keystore（JKS/PKCS12）管理转换；不做 ACME 自动续期；不做企业级证书资产盘点；全部操作只读探测，无任何写副作用；不处理需要上传的在线检查（纯本地）。

## 验收（怎么算完成）

- 离线单测全绿：fixture 证书矩阵（正常/过期/自签/SAN 不匹配/短密钥/弱签名/链缺中间证书）+ 错误根因映射规则断言；hermetic 本地 TLS 服务器（node https + fixture 证书）全链路探测冒烟；typecheck + esbuild 构建通过；真宿主面板冒烟；pack 打包后 CDN manifest/zip 双 200 商城可见。

## 待澄清

（夜班分析时补写；空则留空）

## 决策记录

- 2026-11-06 由 zcode 记录。

- 2026-11-06 实现：Node v24 X509Certificate.subject 为换行分隔格式（非 RFC2253 逗号），dnToObj 双格式兼容；version 属性已移除。链拼装 leaf 判定=不作为任何签发者出现的证书（签发关系 child→issuer）。verifiedPairs 空 ≠ 链篡改（缺中间时相邻本就验不过），降级 info 不冒充 crit。probe 结果字段 verified（防与 API 外层 ok 撞名）。bundle 后 __dirname 漂移：fixturePem 双路径解析（service/ 与 mcp/ 双 bundle 复用）。
