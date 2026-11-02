# 邮件调试台(mail-desk)

把应用发往本机 SMTP(默认 `127.0.0.1:1025`)的测试邮件**全部截下**:面板看 HTML 渲染/纯文本/原始报文/附件,按主题/发件人/收件人/正文搜索;AI 经 MCP 一句话读邮件、提取验证码。零外发、零安装依赖(vendor 内联),数据不出本机。

## 它解决什么

调试邮件流程(注册验证码/重置密码/通知)时,直接真发有风险、MailHog 已停维护、Mailpit 要另装维护——本插件把「本地 catch-all 收信台」装进 Polaris:

- **收**:任何 SMTP 客户端把 host/port 指到 `127.0.0.1:1025` 即可,catch-all 全收,**代码里不存在外发路径**
- **看**:HTML 沙箱预览(脚本全禁+远程图默认阻断防跟踪像素)、纯文本、原始报文(.eml)、附件下载
- **搜**:主题/发件人/收件人/正文关键词,大小写不敏感
- **AI**:对话里说「读一下最新邮件」「刚才的验证码是多少」——MCP 七工具直接给真实结果,验证码按置信度提取(`codes` 字段),不让模型自己猜
- **取证**:落盘 `.eml` 为真相,重启不丢;环形上限 500 封/200MB 自动淘汰最旧

## 快速开始

1. 安装插件(服务自动启动,监听 `127.0.0.1:9875` 数据面 + `127.0.0.1:1025` SMTP 收信口,仅本机可达)
2. 打开面板 → 设置 → 点「运行自检」——服务会给自己发一封真信并断言收到,通过即链路可用
3. 把应用邮件配置指过来(设置页有 Nodemailer/Spring/Django/Flask/Laravel 一键复制片段):
   ```
   Host: 127.0.0.1   Port: 1025   Encryption: None   Auth: 无
   ```
4. 应用发测试邮件 → 面板「收件箱」实时可见(3s 轮询);或在对话里问 AI

## MCP 工具(7 个)

| 工具 | 说明 |
|---|---|
| `mail_stats` | 服务状态/SMTP 口/收件箱数量容量 |
| `mail_list` | 列表(新的在前;可选 query/limit) |
| `mail_get` | 读全文;**不带 id 读最新一封**;返回含 `codes`(疑似验证码,按置信度) |
| `mail_search` | 关键词搜索 |
| `mail_delete` | 删除一封(不可逆) |
| `mail_clear` | 清空收件箱(不可逆,慎用) |
| `mail_selftest` | 试金石自检:发一封真信并断言收到 |

## 架构

```
面板 dist/panel.js(React, react external,42KB)
  └─ cap.kv 读 mdk.service{port,smtpPort,token} → cap.http request 转发
     (请求由宿主进程发出——桌面/手机/Web 全端无跨域;手机 webview 里
      127.0.0.1 指手机自身,直连必挂,daw-studio 实证范式)
service/main.js(node,绑 127.0.0.1)
  ├─ SMTP catch-all(smtp-server@3.21.3,默认 1025,冲突自动向后探测)
  │   只收不发;连接数≤20;每封收件人≤20;单封 5MB 上限
  ├─ HTTP 数据面 /api/*(Bearer token;/__health 恒 200)
  ├─ store:落盘 <appConfigDir>/mail-desk/*.eml 为真相 + 内存索引,环形淘汰
  ├─ kvclient:mdk.settings 3s 热更 / mdk.service 发现 / mdk.meta 60s 心跳
  └─ vendor.cjs(esbuild 内联 smtp-server+mailparser,1.9MB,安装后零 npm i)
mcp/server.js(stdio JSON-RPC;kv 读发现 → Bearer 直调数据面)
```

kv 键空间:`mdk.settings`(SMTP 端口配置)/ `mdk.service`(发现+token)/ `mdk.meta`(心跳)/ `mdk.selftest`(自检报告)。

## 安全与隐私

- 两个 listener 都只绑 `127.0.0.1`,外部机器不可达
- **零外发**:catch-all 接收即终结,代码里不存在转发/出站路径
- 邮件 HTML 预览在 `sandbox=""`(脚本全禁)iframe 里渲染;远程图片默认阻断(防跟踪像素/打开回执),一键放行可恢复
- token 服务启动随机生成,只经本机 kv 分发;所有 `/api/*` 校验 Bearer
- 日志不落邮件正文;环形自淘汰防膨胀;单封 5MB / 总量 200MB 双护栏

## 测试

```bash
npm install
npm run typecheck           # tsc --noEmit,0 错误
npm run build               # vendor.cjs + dist/panel.js
node test/run-tests.mjs     # core 纯函数单测(27)
MDK_TEST_TOKEN=... MDK_TEST_SMTP_PORT=11025 node test/service-tests.mjs   # 真服务+真 SMTP 收信(31)
node test/mcp-tests.mjs     # MCP 真子进程(26)
node /tmp/realbridge-smoke.mjs  # 真宿主桥冒烟(9;需宿主在跑)
```

测试模式环境变量(仅测试,生产无):`MDK_TEST_TOKEN` / `MDK_TEST_SMTP_PORT` / `MDK_TEST_NO_BRIDGE=1`(kv 空实现,防止测试写真实宿主)/ MCP 侧 `MDK_TEST_SERVICE`。

## 已知限制

- 附件经面板下载单文件上限 8MB(base64 通道),超出会提示
- 原始报文预览截断 200KB(完整原文始终在落盘目录)
- HTML 预览是属性级远程资源过滤+沙箱 iframe,不是完整反钓鱼渲染
- SMTP 端口若被占用自动向后探测(最多 10 个),实际端口以面板顶部徽章与 `mdk.service` 为准

## 选型依据

见 `docs/mail-desk-selection.md`(候选池 12 个、八维评分 81.5 分居首;MailHog 停维护/ Mailpit ~7k★ 等外部证据)。
