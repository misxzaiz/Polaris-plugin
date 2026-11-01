/**
 * 渲染断言入口（被 test/render-verify.mjs 经 esbuild 打包后在 Node 内执行）
 * SSR 外壳三 Tab + 任务卡 + 命令行表单（护栏文案）+ 历史 + 设置，HTML 交给外层断言。
 */
import { renderToString } from 'react-dom/server'
import Panel from '../src/Panel'
import JobsTab, { type FormState } from '../src/JobsTab'
import HistoryTab from '../src/HistoryTab'
import SettingsTab from '../src/SettingsTab'
import type { PanelData, Job, RunRecord, AiProvider, Settings } from '../src/ui'

const noop = () => {}
const now = Date.now()

const META = { version: '0.1.0', pid: 1, startedAt: now, lastTickAt: now, degraded: false, bridge: '127.0.0.1:9829', jobCount: 2, enabledCount: 1 }
const SETTINGS: Settings = { retentionRuns: 200, timeoutCommandSec: 120, timeoutHttpSec: 30, timeoutAiSec: 120 }
const PROVIDERS: AiProvider[] = [{ id: 'p1', name: '智谱', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', apiKey: '****abcd', model: 'glm-4.7', wire: 'openai-chat-completions' }]

const JOBS: Job[] = [
  {
    id: 'job_a', name: '早报摘要', type: 'ai', enabled: true,
    schedule: { type: 'daily', time: '08:00' },
    payload: { providerId: 'p1', prompt: '总结', maxTokens: 1024 },
    createdAt: now, updatedAt: now, nextRunAt: now + 3600_000,
    lastRunAt: now - 86_400_000, lastStatus: 'ok', lastSummary: 'AI 回复 320 字 · 2100ms',
  },
  {
    id: 'job_b', name: '本机心跳', type: 'http', enabled: true,
    schedule: { type: 'interval', everyMs: 600_000 },
    payload: { url: 'http://127.0.0.1:8080/health', method: 'GET', allowPrivate: true },
    createdAt: now, updatedAt: now, nextRunAt: now + 60_000,
    lastRunAt: null, lastStatus: null, lastSummary: '',
  },
  {
    id: 'job_c', name: '夜扫缓存', type: 'command', enabled: false,
    schedule: { type: 'cron', expr: '0 23 * * *' },
    payload: { shell: 'powershell', command: 'npm run clean' },
    createdAt: now, updatedAt: now, nextRunAt: null,
    lastRunAt: now - 7200_000, lastStatus: 'fail', lastSummary: '退出码 1',
  },
]

const RUNS: RunRecord[] = [
  { id: 'r3', jobId: 'job_c', jobName: '夜扫缓存', type: 'command', trigger: 'manual', missed: false, status: 'fail', summary: '退出码 1', excerpt: 'npm ERR! missing script', startedAt: now - 7200_000, durationMs: 1200 },
  { id: 'r2', jobId: 'job_a', jobName: '早报摘要', type: 'ai', trigger: 'auto', missed: true, status: 'ok', summary: 'AI 回复 320 字 · 2100ms', excerpt: '今日要点…', startedAt: now - 86_400_000, durationMs: 2100 },
  { id: 'r1', jobId: 'job_b', jobName: '本机心跳', type: 'http', trigger: 'auto', missed: false, status: 'timeout', summary: '超时（>30000ms）', excerpt: '', startedAt: now - 90_000, durationMs: 30_000 },
]

const DATA: PanelData = { meta: META, jobs: JOBS, runs: RUNS, settings: SETTINGS, providers: PROVIDERS }

const COMMAND_FORM: FormState = {
  editingId: null, name: '夜扫', type: 'command',
  schedType: 'cron', everyMinutes: '30', time: '08:00', dows: [1], cronExpr: '0 23 * * *',
  message: '', url: 'https://', method: 'GET', headersText: '', body: '', allowPrivate: false,
  providerId: '', prompt: '', system: '', maxTokens: '1024',
  shell: 'powershell', command: 'npm run clean', commandConfirm: false,
}

const HTTP_FORM: FormState = {
  ...COMMAND_FORM, type: 'http', command: '', name: '心跳',
}

const EMPTY: PanelData = { meta: null, jobs: [], runs: [], settings: null, providers: [] }

;(globalThis as unknown as { __taskRunnerRender: (seed?: string) => Record<string, string> }).__taskRunnerRender =
  (seed?: string) => {
    if (seed === 'empty') {
      return {
        panel: renderToString(<Panel pluginId="task-runner" />),
        jobsEmpty: renderToString(<JobsTab data={EMPTY} notify={noop} refresh={async () => {}} />),
        historyEmpty: renderToString(<HistoryTab runs={[]} jobs={[]} />),
      }
    }
    return {
      panel: renderToString(<Panel pluginId="task-runner" />),
      jobs: renderToString(<JobsTab data={DATA} notify={noop} refresh={async () => {}} />),
      commandForm: renderToString(<JobsTab data={DATA} notify={noop} refresh={async () => {}} initialForm={COMMAND_FORM} />),
      httpForm: renderToString(<JobsTab data={DATA} notify={noop} refresh={async () => {}} initialForm={HTTP_FORM} />),
      history: renderToString(<HistoryTab runs={RUNS} jobs={JOBS} />),
      settings: renderToString(<SettingsTab data={DATA} notify={noop} refresh={async () => {}} />),
    }
  }
