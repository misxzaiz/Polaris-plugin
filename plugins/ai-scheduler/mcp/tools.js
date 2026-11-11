'use strict';
/**
 * tools.js —— AI 工具层（store 注入式，可离线单测）
 *
 * 工具面金标 = 主仓 src-tauri/src/services/scheduler_mcp_server.rs
 * （7 工具：名称/描述/参数 schema/中文响应文案逐字对齐）。
 */

function textResult(text, isError) {
  return { content: [{ type: 'text', text }], isError: !!isError };
}

function structured(structuredContent, text) {
  return {
    content: [{ type: 'text', text: text || JSON.stringify(structuredContent) }],
    structuredContent,
    isError: false,
  };
}

function optionalTrimmed(v) {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t;
}

/**
 * @param store createStore 实例
 */
function buildTools(store) {
  return [
    {
      name: 'list_tasks',
      description: '列出定时任务。',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      async call() {
        const tasks = await store.listTaskViews();
        return structured(
          { count: tasks.length, tasks },
          `已返回 ${tasks.length} 条任务`,
        );
      },
    },
    {
      name: 'get_task',
      description: '获取单个定时任务详情。',
      inputSchema: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', minLength: 1 } },
        additionalProperties: false,
      },
      async call(args) {
        const id = optionalTrimmed(args.id);
        if (!id) throw new Error('id 不能为空');
        const task = await store.getTask(id);
        if (!task) throw new Error(`任务不存在: ${id}`);
        const view = store.mergeView(task, await store.getState(id));
        return structured(view, `任务: ${view.name}`);
      },
    },
    {
      name: 'create_task',
      description: '创建定时任务。',
      inputSchema: {
        type: 'object',
        required: ['name', 'triggerType', 'triggerValue', 'engineId', 'prompt'],
        properties: {
          name: { type: 'string', minLength: 1 },
          enabled: { type: 'boolean' },
          triggerType: { type: 'string', enum: ['once', 'cron', 'interval'] },
          triggerValue: { type: 'string', minLength: 1 },
          engineId: { type: 'string', minLength: 1 },
          prompt: { type: 'string', minLength: 1 },
          workDir: { type: 'string' },
          description: { type: 'string' },
        },
        additionalProperties: false,
      },
      async call(args) {
        const name = optionalTrimmed(args.name);
        if (!name) throw new Error('name 不能为空');
        const triggerType = optionalTrimmed(args.triggerType);
        if (!triggerType) throw new Error('triggerType 不能为空');
        const triggerValue = optionalTrimmed(args.triggerValue);
        if (!triggerValue) throw new Error('triggerValue 不能为空');
        const engineId = optionalTrimmed(args.engineId);
        if (!engineId) throw new Error('engineId 不能为空');
        const prompt = optionalTrimmed(args.prompt);
        if (!prompt) throw new Error('prompt 不能为空');
        const task = await store.createTask({
          name,
          enabled: args.enabled !== false,
          triggerType,
          triggerValue,
          engineId,
          prompt,
          workDir: optionalTrimmed(args.workDir),
          description: optionalTrimmed(args.description),
          notifyOnComplete: true,
        });
        const location = task.workspaceName || '全局';
        return structured(task, `已在【${location}】创建任务：${task.name}`);
      },
    },
    {
      name: 'update_task',
      description: '更新定时任务。',
      inputSchema: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', minLength: 1 },
          name: { type: 'string' },
          enabled: { type: 'boolean' },
          triggerType: { type: 'string', enum: ['once', 'cron', 'interval'] },
          triggerValue: { type: 'string' },
          engineId: { type: 'string' },
          prompt: { type: 'string' },
          workDir: { type: 'string' },
          description: { type: 'string' },
        },
        additionalProperties: false,
      },
      async call(args) {
        const id = optionalTrimmed(args.id);
        if (!id) throw new Error('id 不能为空');
        const updates = {};
        const name = optionalTrimmed(args.name);
        if (name !== null) updates.name = name;
        if (typeof args.enabled === 'boolean') updates.enabled = args.enabled;
        const triggerType = optionalTrimmed(args.triggerType);
        if (triggerType !== null) updates.triggerType = triggerType;
        const triggerValue = optionalTrimmed(args.triggerValue);
        if (triggerValue !== null) updates.triggerValue = triggerValue;
        const engineId = optionalTrimmed(args.engineId);
        if (engineId !== null) updates.engineId = engineId;
        const prompt = optionalTrimmed(args.prompt);
        if (prompt !== null) updates.prompt = prompt;
        const workDir = optionalTrimmed(args.workDir);
        if (workDir !== null) updates.workDir = workDir;
        const description = optionalTrimmed(args.description);
        if (description !== null) updates.description = description;
        const task = await store.updateTask(id, updates);
        return structured(task, `已更新任务：${task.name}`);
      },
    },
    {
      name: 'delete_task',
      description: '删除定时任务。',
      inputSchema: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', minLength: 1 } },
        additionalProperties: false,
      },
      async call(args) {
        const id = optionalTrimmed(args.id);
        if (!id) throw new Error('id 不能为空');
        const task = await store.deleteTask(id);
        if (!task) throw new Error(`任务不存在: ${id}`);
        return structured(task, `已删除任务：${task.name}`);
      },
    },
    {
      name: 'toggle_task',
      description: '切换任务启用状态。',
      inputSchema: {
        type: 'object',
        required: ['id', 'enabled'],
        properties: {
          id: { type: 'string', minLength: 1 },
          enabled: { type: 'boolean' },
        },
        additionalProperties: false,
      },
      async call(args) {
        const id = optionalTrimmed(args.id);
        if (!id) throw new Error('id 不能为空');
        if (typeof args.enabled !== 'boolean') throw new Error('enabled 不能为空');
        const task = await store.updateTask(id, { enabled: args.enabled });
        const status = args.enabled ? '已启用' : '已禁用';
        return structured(task, `任务【${task.name}】${status}`);
      },
    },
    {
      name: 'get_workspace_breakdown',
      description: '获取各工作区的任务数量统计。',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      async call() {
        const tasks = await store.listTasks();
        const breakdown = {};
        for (const t of tasks) {
          const k = t.workspaceName || '全局';
          breakdown[k] = (breakdown[k] || 0) + 1;
        }
        const total = tasks.length;
        return structured({ total, breakdown }, `共 ${total} 条任务`);
      },
    },
  ];
}

module.exports = { buildTools, textResult };
