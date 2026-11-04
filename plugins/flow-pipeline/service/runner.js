'use strict';
/**
 * runner.js —— 流水线运行引擎（零依赖）
 *
 * 语义（对齐 task-runner / data-ark 的既有约定）：
 *   - 队列并发 = 1：同一时刻至多一条流水线在跑，其余排队（排队即 kv 可见）
 *   - 停止：runId 标记 + AbortController，步骤间优雅停、HTTP/AI 在途即时断
 *   - 运行记录增量落 kv（每步一写），三端可看；每管道保留最近 30 条
 *   - 摘要（excerpt）出记录前统一掩码：流水线 secrets + 供应商 apiKey
 *   - 错误传播：默认失败即停；continueOnError=true 的步骤失败记录后继续
 */
const crypto = require('crypto');
const engine = require('../shared/engine');
const steps = require('./steps');

const RUNS_PER_PIPELINE = 30;
const PARAMS_MAX_BYTES = 16 * 1024;

function createRunner(deps) {
  const { kv, getSettings, getProviders, appConfigDir, log, onRunUpdate } = deps;
  const K = {
    runs: (plId) => `flowpipe.runs.${plId}`,
  };

  const queue = []; // {plId, pipeline, trigger, params, runId}
  const active = new Map(); // runId → {abort: AbortController, stopRequested: bool}
  let draining = false;

  function newRunId() {
    return `run_${crypto.randomBytes(6).toString('hex')}`;
  }

  function collectSecrets(pipeline) {
    const vals = [];
    for (const name of pipeline.secrets || []) {
      const v = pipeline.vars && pipeline.vars[name];
      if (typeof v === 'string' && v) vals.push(v);
    }
    for (const p of getProviders() || []) {
      if (p && typeof p.apiKey === 'string' && p.apiKey) vals.push(p.apiKey);
    }
    return vals;
  }

  function maskRecord(run, pipeline) {
    const secrets = collectSecrets(pipeline);
    const clone = JSON.parse(JSON.stringify(run));
    if (clone.params) clone.params = engine.maskDeep(clone.params, secrets);
    for (const st of clone.steps || []) {
      if (st.excerpt) st.excerpt = engine.maskString(st.excerpt, secrets);
      if (st.error) st.error = engine.maskString(st.error, secrets);
      if (Array.isArray(st.warnings)) st.warnings = st.warnings.map((w) => engine.maskString(w, secrets));
    }
    if (clone.error) clone.error = engine.maskString(clone.error, secrets);
    return clone;
  }

  async function persistRun(run, pipeline) {
    try {
      // 单管道运行历史：读取 → 更新本条 → 截断 → 写回（键内聚合，避免 run 键爆炸）
      const list = (await kv.kvGet(K.runs(run.plId))) || [];
      const idx = list.findIndex((r) => r.id === run.id);
      const masked = maskRecord(run, pipeline);
      if (idx >= 0) list[idx] = masked;
      else list.unshift(masked);
      list.sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''));
      await kv.kvSet(K.runs(run.plId), list.slice(0, RUNS_PER_PIPELINE));
      if (typeof onRunUpdate === 'function') {
        try {
          onRunUpdate({
            id: masked.id,
            plId: masked.plId,
            plName: masked.plName,
            trigger: masked.trigger,
            missed: masked.missed,
            status: masked.status,
            startedAt: masked.startedAt,
            finishedAt: masked.finishedAt,
            durationMs: masked.durationMs,
            error: masked.error,
          });
        } catch (_) { /* 索引钩子失败不影响运行 */ }
      }
    } catch (e) {
      log('warn', `运行记录落 kv 失败（run ${run.id}）：${e.message}`);
    }
  }

  /** 入队。返回 runId。 */
  function enqueue(pipeline, trigger, params, { missed } = {}) {
    const runId = newRunId();
    let safeParams = {};
    if (params && typeof params === 'object') {
      try {
        safeParams = JSON.parse(JSON.stringify(params));
      } catch (_) {
        safeParams = {};
      }
    }
    if (JSON.stringify(safeParams || {}).length > PARAMS_MAX_BYTES) safeParams = { _note: '触发参数超过 16KB 上限，未保存原文' };
    const run = {
      id: runId,
      plId: pipeline.id,
      plName: pipeline.name,
      trigger,
      missed: Boolean(missed),
      params: safeParams,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      durationMs: null,
      status: 'queued',
      steps: [],
      error: null,
    };
    persistRun(run, pipeline);
    queue.push({ pipeline, trigger, run, params: safeParams });
    log('info', `入队 ${pipeline.name}（${trigger}）run=${runId}，队列长度 ${queue.length}`);
    setImmediate(() => drain());
    return runId;
  }

  function isIdle() {
    return !draining && queue.length === 0 && active.size === 0;
  }

  async function drain() {
    if (draining) return;
    draining = true;
    try {
      while (queue.length) {
        const job = queue.shift();
        await execute(job);
      }
    } finally {
      draining = false;
    }
  }

  function requestStop(runId) {
    const a = active.get(runId);
    if (!a) return false;
    a.stopRequested = true;
    a.abort.abort(new Error('用户停止'));
    return true;
  }

  function executeJobNow(pipeline, trigger, params, { missed } = {}) {
    // 同步入队并立即开始（供测试注入同步等待）；语义与 enqueue 一致
    return enqueue(pipeline, trigger, params, { missed });
  }

  async function execute(job) {
    const { pipeline, run, params, trigger } = job;
    const abort = new AbortController();
    active.set(run.id, { abort, stopRequested: false });
    const state = active.get(run.id);
    run.status = 'running';
    run.startedAt = new Date().toISOString();
    await persistRun(run, pipeline);

    const ctx = {
      vars: { ...(pipeline.vars || {}) },
      steps: {},
      params: { ...(params || {}) },
      env: {
        now: new Date().toISOString(),
        today: new Date().toISOString().slice(0, 10),
        runId: run.id,
        plId: pipeline.id,
        plName: pipeline.name,
      },
    };
    const ex = {
      signal: abort.signal,
      allowLocal: Boolean(pipeline.allowLocal),
      kv,
      providers: getProviders(),
      getSetting: (k) => {
        const s = getSettings();
        return s ? s[k] : undefined;
      },
      appConfigDir,
      log,
    };

    let runError = null;
    const t0 = Date.now();
    for (let i = 0; i < (pipeline.steps || []).length; i++) {
      const step = pipeline.steps[i];
      if (state.stopRequested) {
        run.status = 'stopped';
        run.error = '用户在第 ' + (i + 1) + ' 步前停止';
        break;
      }
      const rec = {
        id: step.id || `s${i + 1}`,
        type: step.type,
        name: step.name || step.type,
        status: 'running',
        startedAt: new Date().toISOString(),
        durationMs: null,
        error: null,
        excerpt: '',
        warnings: [],
      };
      run.steps.push(rec);
      await persistRun(run, pipeline);
      const st0 = Date.now();
      try {
        // when 门控：在步骤自身插值之前用当前 ctx 判定
        if (step.when) {
          let gate;
          try {
            gate = engine.evaluateExpr(step.when, ctx);
          } catch (e) {
            throw new Error(`when 表达式错误：${e.message}`);
          }
          if (!gate) {
            rec.status = 'skipped';
            rec.excerpt = 'when 条件不满足，已跳过';
            rec.durationMs = Date.now() - st0;
            continue;
          }
        }
        const r = await steps.runStep(step, ctx, ex);
        rec.durationMs = Date.now() - st0;
        rec.warnings = r.warnings || [];
        if (r.ok) {
          rec.status = 'ok';
          rec.excerpt = engine.maskString(String(r.excerpt || ''), collectSecrets(pipeline)).slice(0, 600);
          if (step.saveAs) ctx.steps[step.saveAs] = r.output;
        } else {
          rec.status = 'error';
          rec.error = String(r.error || '步骤失败').slice(0, 500);
          rec.excerpt = engine.maskString(String(r.excerpt || ''), collectSecrets(pipeline)).slice(0, 600);
          if (r.output && step.saveAs) ctx.steps[step.saveAs] = r.output; // 失败输出也可引用（如 resp.status）
          if (!step.continueOnError) {
            runError = `第 ${i + 1} 步「${rec.name}」失败：${rec.error}`;
            break;
          }
        }
      } catch (e) {
        rec.durationMs = Date.now() - st0;
        rec.status = 'error';
        rec.error = String(e.message || e).slice(0, 500);
        if (!step.continueOnError) {
          runError = `第 ${i + 1} 步「${rec.name}」异常：${rec.error}`;
          break;
        }
      }
      await persistRun(run, pipeline);
    }
    if (state.stopRequested && run.status !== 'stopped') run.status = 'stopped';
    if (!runError && run.status !== 'stopped') run.status = 'ok';
    if (runError && run.status !== 'stopped') {
      run.status = 'error';
      run.error = runError;
    }
    run.finishedAt = new Date().toISOString();
    run.durationMs = Date.now() - t0;
    await persistRun(run, pipeline);
    active.delete(run.id);
    log('info', `运行结束 ${run.plName} run=${run.id} status=${run.status} ${run.durationMs}ms`);
    return run;
  }

  return {
    enqueue,
    executeJobNow,
    requestStop,
    isIdle,
    queueLength: () => queue.length,
    activeCount: () => active.size,
    RUNS_PER_PIPELINE,
  };
}

module.exports = { createRunner };
