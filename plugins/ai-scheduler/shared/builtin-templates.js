'use strict';
/**
 * builtin-templates.js —— 内置协议模板（数据金标 = 主仓 models/scheduler.rs
 * get_builtin_protocol_templates 5 条，字段 camelCase，文案逐字保留）。
 *
 * 主仓语义：builtin 模板不入库、每次列表现算合并（存储 CRUD 只管自定义模板）。
 */

function builtin(nowSec) {
  const t = nowSec === undefined ? Math.floor(Date.now() / 1000) : nowSec;
  const base = { builtin: true, promptTemplate: null, customSections: null, enabled: true, createdAt: t, updatedAt: t };
  return [
    {
      ...base,
      id: 'dev-feature',
      name: '功能开发',
      description: '用于持续开发新功能的任务模板，包含需求分析、实现、测试等阶段',
      category: 'development',
      protocolConfig: {
        missionTemplate: '帮我开发以下功能：\n\n{mission}\n\n请按照以下步骤执行：\n1. 分析需求和现有代码结构\n2. 设计实现方案\n3. 编写代码实现\n4. 编写测试用例\n5. 进行代码审查和优化',
        executionRules: '### 1. 检查用户补充\n- 读取用户补充文件\n- 如有新内容，优先处理并归档\n\n### 2. 推进主任务\n- 读取记忆索引了解当前进度\n- 选择下一个待办事项执行\n- 完成后更新记忆\n\n### 3. 记忆更新\n- 新成果写入记忆文件\n- 待办任务写入任务文件',
        memoryRules: '## 成果定义\n\n有价值的工作：\n- 完成具体功能实现\n- 修复已知问题\n- 优化代码质量\n- 产出可复用资产\n\n避免：\n- 无产出的探索\n- 重复性工作',
      },
      params: [
        { key: 'mission', label: '任务目标', paramType: 'textarea', required: true, defaultValue: null, placeholder: '描述要开发的功能...', options: null },
      ],
      defaultTriggerType: 'interval',
      defaultTriggerValue: '1h',
      defaultEngineId: 'claude-code',
      defaultMaxRuns: null,
      defaultTimeoutMinutes: null,
    },
    {
      ...base,
      id: 'protocol-assist',
      name: '协议协助模式',
      description: '完整的协议任务模板，支持任务目标和用户补充内容',
      category: 'development',
      protocolConfig: {
        missionTemplate: '{mission}',
        executionRules: '### 1. 检查用户补充\n- 读取 `.polaris/tasks/{taskId}/supplement.md`\n- 如有新内容，优先处理并归档\n\n### 2. 推进主任务\n- 读取 `memory/index.md` 了解当前进度\n- 选择下一个待办事项执行\n- 完成后更新记忆\n\n### 3. 记忆更新\n- 新成果写入 `memory/index.md`\n- 待办任务写入 `memory/tasks.md`\n\n### 4. 文档备份\n- 用户补充处理完成后迁移到 `supplement-history/`\n- 文档超过 800 行时总结后备份',
        memoryRules: '## 成果定义\n\n有价值的工作：\n- 完成具体功能实现\n- 修复已知问题\n- 优化代码质量\n- 产出可复用资产\n\n避免：\n- 无产出的探索\n- 重复性工作',
      },
      params: [
        { key: 'mission', label: '任务目标', paramType: 'textarea', required: true, defaultValue: null, placeholder: '描述任务目标...', options: null },
      ],
      defaultTriggerType: 'interval',
      defaultTriggerValue: '1h',
      defaultEngineId: 'claude-code',
      defaultMaxRuns: null,
      defaultTimeoutMinutes: null,
    },
    {
      ...base,
      id: 'review-code',
      name: '代码审查',
      description: '用于定期审查代码质量的任务模板',
      category: 'review',
      protocolConfig: {
        missionTemplate: '审查以下代码：\n\n{mission}\n\n审查要点：\n- 代码质量\n- 安全问题\n- 性能问题\n- 测试覆盖',
        executionRules: '### 1. 收集信息\n- 获取待审查的代码变更\n- 分析代码结构\n\n### 2. 执行审查\n- 检查代码质量\n- 分析潜在问题\n- 提出改进建议\n\n### 3. 汇报结果\n- 总结审查发现\n- 提供改进建议',
        memoryRules: '## 审查清单\n\n- [ ] 代码质量\n- [ ] 安全问题\n- [ ] 性能问题\n- [ ] 测试覆盖\n- [ ] 文档完整',
      },
      params: [
        { key: 'mission', label: '审查范围', paramType: 'textarea', required: true, defaultValue: null, placeholder: '描述要审查的代码范围...', options: null },
      ],
      defaultTriggerType: 'interval',
      defaultTriggerValue: '6h',
      defaultEngineId: 'claude-code',
      defaultMaxRuns: null,
      defaultTimeoutMinutes: 30,
    },
    {
      ...base,
      id: 'news-search',
      name: '新闻搜索',
      description: '用于搜索和总结新闻的任务模板',
      category: 'news',
      protocolConfig: {
        missionTemplate: '搜索以下关键词的新闻：\n\n{keywords}\n\n时间范围：{timeRange}',
        executionRules: '### 1. 搜索新闻\n- 使用指定关键词搜索\n- 筛选相关新闻\n- 记录来源\n\n### 2. 总结要点\n- 提取关键信息\n- 分类整理\n- 生成摘要\n\n### 3. 汇报结果\n- 汇总新闻要点\n- 提供原文链接',
        memoryRules: '## 搜索范围\n\n- 关键词: {keywords}\n- 时间范围: {timeRange}\n- 来源限制: {sources}',
      },
      params: [
        { key: 'keywords', label: '搜索关键词', paramType: 'text', required: true, defaultValue: null, placeholder: '输入搜索关键词...', options: null },
        { key: 'timeRange', label: '时间范围', paramType: 'select', required: true, defaultValue: '1d', placeholder: null, options: [
          { value: '1d', label: '最近一天' }, { value: '3d', label: '最近三天' },
          { value: '1w', label: '最近一周' }, { value: '1m', label: '最近一月' },
        ] },
        { key: 'sources', label: '来源限制', paramType: 'text', required: false, defaultValue: null, placeholder: '可选，限制新闻来源', options: null },
      ],
      defaultTriggerType: 'interval',
      defaultTriggerValue: '12h',
      defaultEngineId: 'claude-code',
      defaultMaxRuns: null,
      defaultTimeoutMinutes: 15,
    },
    {
      ...base,
      id: 'monitor-service',
      name: '服务监控',
      description: '用于监控服务状态的任务模板',
      category: 'monitor',
      protocolConfig: {
        missionTemplate: '监控以下服务：\n\n{service}\n\n监控项：\n- 服务可用性\n- 响应时间\n- 错误率',
        executionRules: '### 1. 检查状态\n- 获取服务状态\n- 检查关键指标\n- 记录数据\n\n### 2. 分析问题\n- 检测异常\n- 分析原因\n- 评估影响\n\n### 3. 汇报结果\n- 状态摘要\n- 问题报告\n- 建议措施',
        memoryRules: '## 监控指标\n\n- 服务名称: {service}\n- 检查频率: {interval}\n- 告警阈值: {threshold}',
      },
      params: [
        { key: 'service', label: '服务名称', paramType: 'text', required: true, defaultValue: null, placeholder: '输入服务名称...', options: null },
        { key: 'interval', label: '检查间隔', paramType: 'select', required: true, defaultValue: '5m', placeholder: null, options: [
          { value: '1m', label: '1 分钟' }, { value: '5m', label: '5 分钟' },
          { value: '15m', label: '15 分钟' }, { value: '30m', label: '30 分钟' },
        ] },
        { key: 'threshold', label: '告警阈值', paramType: 'text', required: false, defaultValue: '响应时间 > 5s 或 错误率 > 5%', placeholder: null, options: null },
      ],
      defaultTriggerType: 'interval',
      defaultTriggerValue: '5m',
      defaultEngineId: 'claude-code',
      defaultMaxRuns: null,
      defaultTimeoutMinutes: 5,
    },
  ];
}

module.exports = { builtinTemplates: builtin };
