'use strict';
/**
 * presets.js —— 内置分流模板（零配置可用；与 MCP builtin 工具、面板预设 chips 共用）
 * 模板结构约束见 shared/triage-core.js 头注释；所有预设必须能过 validatePipeline。
 */

const BUILTIN_PIPELINES = [
  {
    name: 'log-triage',
    description: '日志行分级分流：按级别关键词分类，抽出级别/时间/组件/消息，按级别给出处置结论',
    pipeline: {
      name: 'log-triage',
      description: '日志行分级分流（FATAL/Error/WARN/Info）',
      classes: [
        { id: 'fatal', name: '致命错误', anyOf: ['re:\\bFATAL\\b', 'fatal error', '进程崩溃', 'panic'] },
        { id: 'error', name: '错误', anyOf: ['re:\\bERROR\\b', 're:\\bError\\b', 're:\\bERR\\b', '异常', '失败'] },
        { id: 'warn', name: '警告', anyOf: ['re:\\bWARN(ING)?\\b', 're:\\bWRN\\b', '告警', '重试'] },
        { id: 'info', name: '信息', anyOf: ['re:\\bINFO\\b', 're:\\bDEBUG\\b', 're:\\bTRACE\\b'] },
      ],
      extract: {
        '*': {
          ts: { pattern: 're:(\\d{4}-\\d{2}-\\d{2}[T ]\\d{2}:\\d{2}(:\\d{2})?(?:\\.\\d+)?(?:Z|[+-]\\d{2}:?\\d{2})?)', type: 'date', required: false },
          component: { pattern: 're:\\[([\\w.-]+)\\]', type: 'string', required: false },
          message: { pattern: 're:(?:ERROR|WARN|INFO|FATAL|DEBUG)\\s+.*?[-–:]\\s+(.+)$', type: 'string', required: false },
        },
      },
      decide: {
        fatal: [{ when: { field: 'component', op: 'exists' }, then: { verdict: '立即处理', severity: 'P0', label: '致命', route: 'oncall', note: '致命错误须立即人工介入' } }, { when: { field: 'message', op: 'exists' }, then: { verdict: '立即处理', severity: 'P0', label: '致命', route: 'oncall' } }],
        error: [{ when: { field: 'component', op: 'exists' }, then: { verdict: '尽快处理', severity: 'P1', label: '错误', route: 'issue' } }, { when: { field: 'message', op: 'exists' }, then: { verdict: '尽快处理', severity: 'P1', label: '错误', route: 'issue' } }],
        warn: [{ when: { field: 'message', op: 'exists' }, then: { verdict: '观察', severity: 'P2', label: '警告', route: 'backlog' } }, { when: { field: 'component', op: 'exists' }, then: { verdict: '观察', severity: 'P2', label: '警告', route: 'backlog' } }],
        info: [{ when: { field: 'message', op: 'exists' }, then: { verdict: '无需处理', severity: 'P3', label: '信息' } }],
      },
      fallback: { verdict: '未分类日志', severity: 'P3', note: '可按需扩充 classes 关键词' },
    },
  },
  {
    name: 'latency-triage',
    description: '延迟告警分流：抽出耗时/端点，按阈值分级（≥5s P0 / ≥1s P1 / ≥500ms P2 / 其余正常）',
    pipeline: {
      name: 'latency-triage',
      description: '接口延迟告警按耗时阈值分级',
      classes: [
        { id: 'latency', name: '延迟报告', anyOf: ['re:\\d+(?:\\.\\d+)?\\s*ms', '耗时', 'latency', 'timeout', '超时', 'slow'] },
      ],
      extract: {
        latency: {
          duration: { pattern: 're:(\\d+(?:\\.\\d+)?)\\s*(?:ms|毫秒)', type: 'duration', required: true },
          endpoint: { pattern: 're:(GET|POST|PUT|DELETE|PATCH)\\s+(\\S+)', group: 2, type: 'string', required: false },
          status: { pattern: 're:\\bstatus[=:\\s]+(\\d{3})\\b', group: 1, type: 'int', required: false },
        },
      },
      decide: {
        latency: [
          { when: { field: 'duration', op: 'gte', value: 5000 }, then: { verdict: '立即降级/扩容', severity: 'P0', label: '严重延迟', route: 'oncall' } },
          { when: { field: 'duration', op: 'gte', value: 1000 }, then: { verdict: '尽快排查', severity: 'P1', label: '高延迟', route: 'issue' } },
          { when: { field: 'duration', op: 'gte', value: 500 }, then: { verdict: '观察', severity: 'P2', label: '中延迟', route: 'backlog' } },
          { when: { field: 'duration', op: 'exists' }, then: { verdict: '正常范围', severity: 'P3', label: '低延迟' } },
        ],
      },
      fallback: { verdict: '未识别延迟信息', severity: 'P3' },
    },
  },
  {
    name: 'disk-triage',
    description: '磁盘水位分流：抽出使用率百分比与挂载点，按水位分级（≥95% 立即扩容 / ≥85% 尽快清理 / ≥70% 观察）',
    pipeline: {
      name: 'disk-triage',
      description: '磁盘使用率告警按水位分级',
      classes: [
        { id: 'disk', name: '磁盘报告', anyOf: ['re:使用率', 're:disk', 're:/dev/', 're:磁盘', 'usage'] },
      ],
      extract: {
        disk: {
          percent: { pattern: 're:(\\d+(?:\\.\\d+)?)\\s*%', group: 1, type: 'float', required: true },
          device: { pattern: 're:(/dev/[\\w]+|\\b[A-Z]:\\\\)', type: 'string', required: false },
          free: { pattern: 're:(\\d+(?:\\.\\d+)?)\\s*(?:GB|GiB|MB|MiB)\\s*(?:可用|剩余|free)', type: 'float', required: false },
        },
      },
      decide: {
        disk: [
          { when: { field: 'percent', op: 'gte', value: 95 }, then: { verdict: '立即扩容/清理', severity: 'P0', label: '磁盘将满', route: 'oncall' } },
          { when: { field: 'percent', op: 'gte', value: 85 }, then: { verdict: '尽快清理', severity: 'P1', label: '磁盘高水位', route: 'issue' } },
          { when: { field: 'percent', op: 'gte', value: 70 }, then: { verdict: '观察', severity: 'P2', label: '磁盘中水位', route: 'backlog' } },
          { when: { field: 'percent', op: 'exists' }, then: { verdict: '水位正常', severity: 'P3', label: '低水位' } },
        ],
      },
      fallback: { verdict: '未识别磁盘信息', severity: 'P3' },
    },
  },
];

module.exports = { BUILTIN_PIPELINES };
