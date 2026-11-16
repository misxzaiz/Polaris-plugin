# model-desk 模型供应商管理台

把「加一个模型供应商、测一个端点通不通、看这个月 Token 花在哪」从改 config.json + 手工 curl
变成本地面板闭环。

## 能力

- **供应商 Profile 管理**：增删改/复制/激活（设全局默认）、三态 wireApi、结构化认证
  （authType + 环境变量名 + 自定义头/环境变量）、maxTokens/contextWindow、从端点拉取模型列表、
  连接测试（区分鉴权/路径/服务端/网络错误）、预设画廊、搜索与引擎筛选、快捷输入（一行粘贴 baseUrl/model/key）
- **Token 用量看板**：汇总/按模型/按引擎/日趋势/明细日志，时间范围筛选（TimeRangePicker）
- 删除 Profile 时自动清理状态栏镜像与各会话的悬空引用（原宿主逻辑同源）

## 数据面

- Profile 读写：`cap.config` 顶层 patch（`modelProfiles` / `activeModelProfileId`）
- 用量统计：宿主 `get_usage_*` 命令（SQLite 用量库）
- 连接测试/拉模型：宿主 `test_model_profile_connection` / `fetch_models_for_profile`

纯前端面板：无后台服务、无 MCP、零外联（连接测试只打 Profile 配置的端点）。
