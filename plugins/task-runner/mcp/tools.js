'use strict';
/**
 * tools.js —— MCP 工具定义（kv 注入式，便于离线单测 confirm 闸与流程）
 *
 * 读路径：直接读 taskrun.*（jobs/meta/runs）。
 * 写路径：写命令键 cmd.<op>.<nonce> → 轮询 result.<nonce>（≤15s）。
 * 危险闸：task_add(command)、task_run、task_remove 必须 confirm:true。
 */
const engine = require('../shared/engine');
const core = require('../shared/exec-core');

const K = {
  settings: 'taskrun.settings',
  providers: 'taskrun.providers',
  jobs: 'taskrun.jobs',
  meta: 'taskrun.meta',
  cmdPrefix: 'taskrun.cmd.',
  resultPrefix: 'taskrun.result.',
  runsIdx: 'taskrun.runsIdx',
  runChunk: (n) => `taskrun.run.${n}`,
};

function nonce() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function oneLine(s, cap = 120) {
  const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return t.length <= cap ? t : t.slice(0, cap) + '…';
}

/** 读任务表（含容错）。 */
async function readJobs(kv) {
  const v = await kv.kvGet(K.jobs).catch(() => null);
  if (!v || typeof v !== 'object' || !Array.isArray(v.jobs)) return [];
  return v.jobs.filter((j) => j && typeof j === 'object');
}

async function readRuns(kv, { limit = 20, jobId = '' } = {}) {
  const idx = await kv.kvGet(K.runsIdx).catch(() => null);
  const chunkCount = idx && typeof idx === 'object' && Number.isFinite(idx.chunkCount) ? idx.chunkCount : 0;
  const cap = Math.min(Math.max(1, limit), 100);
  const out = [];
  for (let n = chunkCount - 1; n >= 0 && out.length < cap; n--) {
    const chunk = await kv.kvGet(K.runChunk(n)).catch(() => null);
    if (!Array.isArray(chunk)) continue;
    for (let i = chunk.length - 1; i >= 0 && out.length < cap; i--) {
      const r = chunk[i];
      if (!r || typeof r !== 'object') continue;
      if (jobId && r.jobId !== jobId) continue;
      out.push(r);
    }
  }
  return out;
}

/** 写命令键并等待服务回执。queued=true 时回执可能只是「已入队」。 */
async function sendCommand(kv, op, payload, { waitMs = 15000 } = {}) {
  const n = nonce();
  await kv.kvSet(`${K.cmdPrefix}${op}.${n}`, { op, ...payload, at: Date.now() });
  const deadline = Date.now() + waitMs;
  for (;;) {
    const r = await kv.kvGet(K.resultPrefix + n).catch(() => null);
    if (r && typeof r === 'object' && ('ok' in r || 'error' in r)) {
      // 回执含 queued:true 时继续等最终结果（命令执行可能超过单次轮询窗口）
      if (r.queued === true && Date.now() < deadline) {
        await new Promise((res) => setTimeout(res, 800));
        continue;
      }
      await kv.kvDel(K.resultPrefix + n).catch(() => {});
      return r;
    }
    if (Date.now() > deadline) {
      return { ok: false, error: '服务未在 15 秒内回执（可能未运行或任务仍在执行）——稍后在运行历史里查看结果' };
    }
    await new Promise((res) => setTimeout(res, 800));
  }
}

function fmtJob(j) {
  const sched = engine.describeSchedule(j.schedule);
  const next = Number.isFinite(j.nextRunAt) ? new Date(j.nextRunAt).toLocaleString() : (j.enabled ? '?' : '已停用');
  const last = j.lastStatus
    ? `${j.lastStatus}（${new Date(j.lastRunAt).toLocaleString()}）${j.lastSummary ? ' ' + oneLine(j.lastSummary, 80) : ''}`
    : '从未运行';
  const danger = j.type === 'command' ? ' [命令]' : '';
  return `- ${j.name}（id: ${j.id}，${j.type}${danger}${j.enabled ? '' : '，已停用'}）\n  调度: ${sched} · 下次: ${next}\n  上次: ${last}`;
}

function buildTools(kv) {
  const needConfirm = (args) => args && args.confirm === true;

  return [
    {
      name: 'task_list',
      description: '列出定时任务台的全部任务（调度/下次触发/上次结果）。适用：「我有哪些定时任务」「每天的任务是几点跑的」「上次跑成功了吗」。',
      inputSchema: { type: 'object', properties: {} },
      async call() {
        const jobs = await readJobs(kv);
        if (!jobs.length) return { content: [{ type: 'text', text: '暂无定时任务。可用 task_add 创建（提醒/HTTP 探测/AI 提示词/命令行四类）。' }], isError: false };
        const lines = jobs.map((j) => fmtJob(j));
        return { content: [{ type: 'text', text: `共 ${jobs.length} 个任务：\n${lines.join('\n')}` }], isError: false };
      },
    },
    {
      name: 'task_add',
      description: '创建定时任务。四类：notify 提醒（到点记录一条通知）、http HTTP 探测（到点请求一个 URL 记录状态）、ai AI 提示词（到点用已配置的供应商跑一次提示词）、command 命令行（到点执行 PowerShell/cmd 命令，需 confirm）。调度四种：interval 每 N 分钟、daily 每天 HH:MM、weekly 每周几 HH:MM、cron 五字段。适用：「每天早上八点提醒我站会」「每 10 分钟探测一下 xx 接口」「每天 8 点让 AI 总结一句 xx」。',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '任务名（≤80 字）' },
          type: { type: 'string', enum: ['notify', 'http', 'ai', 'command'], description: '任务类型' },
          schedule: {
            type: 'object',
            description: '调度：interval 用 everyMinutes；daily 用 time="HH:MM"；weekly 用 time+dows=[0-6]（0=周日）；cron 用 expr 五字段（分 时 日 月 周）',
          },
          payload: { type: 'object', description: '按类型：notify{message}；http{url,method?,headers?,body?,allowPrivate?}；ai{providerId,prompt,system?,maxTokens?}；command{shell:powershell|cmd,command}' },
          confirm: { type: 'boolean', description: 'command 类型任务必须 true（危险操作，先与用户确认）' },
        },
        required: ['name', 'type', 'schedule', 'payload'],
      },
      async call(args) {
        if (args.type === 'command' && !needConfirm(args)) {
          return { content: [{ type: 'text', text: '命令行任务属于危险操作（到点会真实执行命令）。请先向用户复述将要执行的命令与调度，确认后带 confirm:true 重试。' }], isError: true };
        }
        const norm = core.normalizeJob({ name: args.name, type: args.type, schedule: args.schedule, payload: args.payload }, () => `job_${nonce()}`);
        if (!norm.ok) return { content: [{ type: 'text', text: `任务定义不合法：${norm.error}` }], isError: true };
        const r = await sendCommand(kv, 'add', { job: norm.job });
        if (!r.ok) return { content: [{ type: 'text', text: `创建失败：${r.error || '服务未回执'}` }], isError: true };
        const next = Number.isFinite(r.nextRunAt) ? new Date(r.nextRunAt).toLocaleString() : '?';
        return { content: [{ type: 'text', text: `已创建「${norm.job.name}」（id: ${r.jobId}，${engine.describeSchedule(norm.job.schedule)}），下次触发 ${next}。` }], isError: false };
      },
    },
    {
      name: 'task_run',
      description: '立即手动执行一个定时任务（不影响其正常调度节奏），结果进运行历史。适用：「现在就跑一次这个任务」「手动触发一下探测」。需 confirm:true。',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '任务 id（task_list 里拿）' },
          confirm: { type: 'boolean', description: '必须 true（手动执行会产生真实副作用：发请求/跑命令/花 AI token）' },
        },
        required: ['id', 'confirm'],
      },
      async call(args) {
        if (!needConfirm(args)) {
          return { content: [{ type: 'text', text: '手动执行会产生真实副作用。请先与用户确认后带 confirm:true 重试。' }], isError: true };
        }
        const r = await sendCommand(kv, 'runNow', { id: args.id }, { waitMs: 30000 });
        if (!r.ok) return { content: [{ type: 'text', text: `执行失败：${r.error || '服务未回执'}` }], isError: true };
        if (r.queued) return { content: [{ type: 'text', text: `已入队执行（任务 ${r.jobId}），命令执行可能超过 30 秒——结果稍后用 task_history 查看。` }], isError: false };
        return { content: [{ type: 'text', text: `已执行（${r.status}）：${oneLine(r.summary || '', 200)}\n详情见 task_history。` }], isError: false };
      },
    },
    {
      name: 'task_history',
      description: '查看定时任务运行历史（状态/耗时/结果摘录），可按任务过滤。适用：「昨晚的任务跑了吗」「这个探测最近成功过几次」「刚才那条命令的输出是什么」。',
      inputSchema: {
        type: 'object',
        properties: {
          jobId: { type: 'string', description: '只看某任务（可选）' },
          limit: { type: 'number', description: '条数（默认 15，≤100）' },
        },
      },
      async call(args) {
        const runs = await readRuns(kv, { limit: args.limit || 15, jobId: args.jobId || '' });
        if (!runs.length) return { content: [{ type: 'text', text: '暂无运行记录。' }], isError: false };
        const lines = runs.map((r) => {
          const miss = r.missed ? '[补跑]' : '';
          const trig = r.trigger === 'manual' ? '[手动]' : '';
          return `- ${new Date(r.startedAt).toLocaleString()} ${trig}${miss} ${r.jobName}（${r.type}）→ ${r.status} · ${r.durationMs}ms\n  ${oneLine(r.summary, 160)}`;
        });
        return { content: [{ type: 'text', text: `最近 ${runs.length} 条运行记录：\n${lines.join('\n')}` }], isError: false };
      },
    },
    {
      name: 'task_set',
      description: '启用/停用一个定时任务（不删除，停用后不再触发）。适用：「先别跑那个探测了」「把提醒恢复回来」。',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '任务 id' },
          enabled: { type: 'boolean', description: 'true=启用 false=停用' },
        },
        required: ['id', 'enabled'],
      },
      async call(args) {
        const r = await sendCommand(kv, 'setEnabled', { id: args.id, enabled: args.enabled !== false });
        if (!r.ok) return { content: [{ type: 'text', text: `操作失败：${r.error || '服务未回执'}` }], isError: true };
        return { content: [{ type: 'text', text: `任务 ${args.id} 已${r.enabled ? '启用' : '停用'}。` }], isError: false };
      },
    },
    {
      name: 'task_remove',
      description: '删除一个定时任务（不可恢复，运行历史保留）。适用：「把这个任务删了」。需 confirm:true。',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '任务 id' },
          confirm: { type: 'boolean', description: '必须 true（删除不可恢复，先与用户确认）' },
        },
        required: ['id', 'confirm'],
      },
      async call(args) {
        if (!needConfirm(args)) {
          return { content: [{ type: 'text', text: '删除不可恢复。请先向用户复述要删除的任务（task_list 可查），确认后带 confirm:true 重试。' }], isError: true };
        }
        const r = await sendCommand(kv, 'remove', { id: args.id });
        if (!r.ok) return { content: [{ type: 'text', text: `删除失败：${r.error || '服务未回执'}` }], isError: true };
        return { content: [{ type: 'text', text: `已删除任务 ${r.jobId}。` }], isError: false };
      },
    },
  ];
}

module.exports = { buildTools, readJobs, readRuns, sendCommand, oneLine, K };
