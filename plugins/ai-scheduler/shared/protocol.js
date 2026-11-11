'use strict';
/**
 * protocol.js —— 协议模式任务文档（零依赖）
 *
 * 移植金标：
 *   - 主仓 src-tauri/src/services/scheduler/protocol_task.rs（任务目录结构/文档生成/
 *     读取更新/备份/extract_user_content/build_protocol_prompt，含 4 个 #[test] 用例）
 *   - 主仓 src-tauri/src/models/scheduler.rs render_protocol_template /
 *     generate_protocol_document / get_builtin_protocol_templates（5 个内置模板数据）
 *
 * 时区金标（有意保留）：protocol_task.rs 用本地时间（时间戳/创建时间）；
 * render_protocol_template / apply_template 用 UTC。两套并存照抄。
 */
const fs = require('fs');
const path = require('path');
const { weekdayNameCn } = require('./engine');

const TIMESTAMP_FORMAT_LEN = 14; // YYYYMMDDHHMMSS
const BACKUP_LINE_THRESHOLD = 800;

// ── 时间戳与路径（金标 protocol_task.rs，本地时区）──────────────────────────
function pad2(n) { return String(n).padStart(2, '0'); }

function generateTimestamp(nowMs) {
  const d = nowMs === undefined ? new Date() : new Date(nowMs);
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`
    + `${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
}

function generateTaskPathFromTimestamp(timestamp) {
  return `.polaris/tasks/${timestamp}`;
}

function generateTaskPath(nowMs) {
  return generateTaskPathFromTimestamp(generateTimestamp(nowMs));
}

function extractTimestamp(taskPath) {
  const parts = String(taskPath).split('/');
  return parts.length ? parts[parts.length - 1] : '';
}

// ── 文档生成（金标 generate_protocol_md 等，文案逐字保留）───────────────────
function localDateTime(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} `
    + `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function generateProtocolMd(taskId, mission, workspaceRoot, timestamp, nowMs) {
  const now = localDateTime(nowMs === undefined ? new Date() : new Date(nowMs));
  return `# 任务协议

> 任务ID: ${taskId}
> 创建时间: ${now}
> 版本: 1.0.0

---

## 任务目标

${mission}

---

## 工作区

\`\`\`
${workspaceRoot}
\`\`\`

---

## 执行规则

每次触发时按以下顺序执行：

### 1. 检查用户补充
- 读取 \`.polaris/tasks/${timestamp}/supplement.md\`
- 如有新内容，优先处理并归档

### 2. 推进主任务
- 读取 \`.polaris/tasks/${timestamp}/memory/index.md\` 了解当前进度
- 选择下一个待办事项执行
- 完成后更新记忆

### 3. 记忆更新
- 新成果写入 \`.polaris/tasks/${timestamp}/memory/index.md\`
- 待办任务写入 \`.polaris/tasks/${timestamp}/memory/tasks.md\`

### 4. 文档备份
- 用户补充处理完成后迁移到 \`.oprcli/tasks/${timestamp}/supplement-history/\`
- 文档超过 ${BACKUP_LINE_THRESHOLD} 行时总结后备份

---

## 补充

1. 分析后无需用户审查
2. 修改内容后及时提交git
3. 将任务拆分处理，每次完成一部分，当任务都完成后，就测试，审查，优化，改造

---

## 成果定义

有价值的工作：
- 完成具体功能实现
- 修复已知问题
- 优化代码质量
- 产出可复用资产

避免：
- 无产出的探索
- 重复性工作

---

## 协议更新

可修改本协议，修改时记录：
- 修改内容
- 修改原因
- 预期效果

不可删除：
- 任务目标
- 工作区
`;
}

/** 金标 render_protocol_from_template（协议文档级模板，{{var}} 占位） */
function renderProtocolFromTemplate(taskId, mission, workspaceRoot, timestamp, template, nowMs) {
  const d = nowMs === undefined ? new Date() : new Date(nowMs);
  return String(template)
    .replace(/\{\{taskId\}\}/g, taskId)
    .replace(/\{\{mission\}\}/g, mission)
    .replace(/\{\{workspaceRoot\}\}/g, workspaceRoot)
    .replace(/\{\{timestamp\}\}/g, timestamp)
    .replace(/\{\{createdAt\}\}/g, localDateTime(d))
    .replace(/\{\{currentDate\}\}/g, `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`);
}

function generateSupplementMd(timestamp) {
  return `# 用户补充

> 用于临时调整任务方向或补充要求
> AI 处理后会清空内容，历史记录保存在 .oprcli/tasks/${timestamp}/supplement-history/

---

<!-- 在下方添加补充内容 -->



`;
}

function generateMemoryIndex() {
  return `# 成果索引

## 当前状态
状态: 初始化
进度: 0%

## 已完成
- [暂无]

## 进行中
- [暂无]
`;
}

function generateMemoryTasks(mission) {
  return `# 任务队列

## 待办
1. 分析任务目标：${mission}
2. 拆解为可执行步骤
3. 逐步推进

## 已完成
- [暂无]
`;
}

// ── 任务目录结构（金标 create_task_structure）───────────────────────────────
function createTaskStructure(workDir, taskId, mission, templateContent, nowMs) {
  const timestamp = generateTimestamp(nowMs);
  const taskPath = generateTaskPathFromTimestamp(timestamp);
  const full = path.join(workDir, taskPath);
  fs.mkdirSync(path.join(full, 'memory'), { recursive: true });
  fs.mkdirSync(path.join(workDir, '.oprcli', 'tasks', timestamp, 'supplement-history'), { recursive: true });

  const protocolContent = templateContent
    ? renderProtocolFromTemplate(taskId, mission, workDir, timestamp, templateContent, nowMs)
    : generateProtocolMd(taskId, mission, workDir, timestamp, nowMs);
  fs.writeFileSync(path.join(full, 'protocol.md'), protocolContent);
  fs.writeFileSync(path.join(full, 'supplement.md'), generateSupplementMd(timestamp));
  fs.writeFileSync(path.join(full, 'memory', 'index.md'), generateMemoryIndex());
  fs.writeFileSync(path.join(full, 'memory', 'tasks.md'), generateMemoryTasks(mission));
  return taskPath;
}

// ── 读取 / 更新 ─────────────────────────────────────────────────────────────
function readDoc(workDir, taskPath, rel) {
  return fs.readFileSync(path.join(workDir, taskPath, rel), 'utf8');
}
const readProtocol = (w, t) => readDoc(w, t, 'protocol.md');
const readSupplement = (w, t) => readDoc(w, t, 'supplement.md');
const readMemoryIndex = (w, t) => readDoc(w, t, path.join('memory', 'index.md'));
const readMemoryTasks = (w, t) => readDoc(w, t, path.join('memory', 'tasks.md'));
const readAllMemory = (w, t) => [readMemoryIndex(w, t), readMemoryTasks(w, t)];

function writeDoc(workDir, taskPath, rel, content) {
  fs.writeFileSync(path.join(workDir, taskPath, rel), content);
}
const updateProtocol = (w, t, c) => writeDoc(w, t, 'protocol.md', c);
const updateSupplement = (w, t, c) => writeDoc(w, t, 'supplement.md', c);
const updateMemoryIndex = (w, t, c) => writeDoc(w, t, path.join('memory', 'index.md'), c);
const updateMemoryTasks = (w, t, c) => writeDoc(w, t, path.join('memory', 'tasks.md'), c);

function clearSupplement(workDir, taskPath) {
  updateSupplement(workDir, taskPath, generateSupplementMd(extractTimestamp(taskPath)));
}

// ── 备份（金标 backup_supplement / backup_document）─────────────────────────
function backupTs(nowMs) {
  const d = nowMs === undefined ? new Date() : new Date(nowMs);
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
}

function backupSupplement(workDir, taskPath, content, nowMs) {
  const taskTimestamp = extractTimestamp(taskPath);
  const dir = path.join(workDir, '.oprcli', 'tasks', taskTimestamp, 'supplement-history');
  fs.mkdirSync(dir, { recursive: true });
  const name = `${backupTs(nowMs)}.md`;
  const body = `# 用户补充备份 (${localDateTime(nowMs === undefined ? new Date() : new Date(nowMs))})\n\n${content}`;
  const p = path.join(dir, name);
  fs.writeFileSync(p, body);
  return p;
}

function backupDocument(workDir, taskPath, docName, content, summary, nowMs) {
  const taskTimestamp = extractTimestamp(taskPath);
  const dir = path.join(workDir, '.oprcli', 'tasks', taskTimestamp, 'doc-history');
  fs.mkdirSync(dir, { recursive: true });
  const name = `${docName}-${backupTs(nowMs)}.md`;
  const d = new Date(nowMs === undefined ? Date.now() : nowMs);
  const body = summary
    ? `# ${docName} 备份 (${localDateTime(d)})\n\n## 摘要\n\n${summary}\n\n## 原文\n\n${content}`
    : `# ${docName} 备份 (${localDateTime(d)})\n\n${content}`;
  const p = path.join(dir, name);
  fs.writeFileSync(p, body);
  return p;
}

function deleteTaskStructure(workDir, taskPath) {
  const full = path.join(workDir, taskPath);
  fs.rmSync(full, { recursive: true, force: true });
  const ts = extractTimestamp(taskPath);
  if (ts) {
    fs.rmSync(path.join(workDir, '.oprcli', 'tasks', ts), { recursive: true, force: true });
  }
}

// ── 内容分析（金标 extract_user_content，含 4 个 #[test] 用例语义）──────────
function extractUserContent(fullContent) {
  const lines = String(fullContent).split('\n');
  let contentStarted = false;
  const result = [];
  for (const line of lines) {
    if (line.includes('<!-- 在下方添加补充内容 -->')) { contentStarted = true; continue; }
    if (contentStarted) {
      if (line.trim() === '' && result.length === 0) continue;
      result.push(line);
    }
  }
  while (result.length && result[result.length - 1].trim() === '') result.pop();
  return result.join('\n');
}

function hasSupplementContent(fullContent) {
  return extractUserContent(fullContent).trim() !== '';
}

function countLines(content) {
  // Rust content.lines().count()：按 \n 切分，空串为 0 行；尾随 \n 不多计
  const s = String(content);
  if (s === '') return 0;
  const parts = s.split('\n');
  return parts[parts.length - 1] === '' ? parts.length - 1 : parts.length;
}

function needsBackup(content) {
  return countLines(content) > BACKUP_LINE_THRESHOLD;
}

// ── 协议 prompt 构建（金标 build_protocol_prompt）───────────────────────────
function buildProtocolPrompt(workDir, taskPath) {
  const protocol = readProtocol(workDir, taskPath);
  const supplement = readSupplement(workDir, taskPath);
  const [memoryIndex, memoryTasks] = readAllMemory(workDir, taskPath);
  const userSupplement = extractUserContent(supplement);

  const parts = [protocol, '\n---\n'];
  if (userSupplement.trim() !== '') {
    parts.push(`# 用户补充（当前轮次）\n\n${userSupplement}\n\n---\n`);
  }
  parts.push(`# 当前状态\n\n## 进度索引\n\n${memoryIndex}\n\n## 任务队列\n\n${memoryTasks}`);
  return parts.join('\n');
}

// ── 协议模板渲染（金标 models/scheduler.rs render_protocol_template，UTC）───
function renderProtocolTemplate(template, params, nowMs) {
  const now = nowMs === undefined ? new Date() : new Date(nowMs);
  const date = `${now.getUTCFullYear()}-${pad2(now.getUTCMonth() + 1)}-${pad2(now.getUTCDate())}`;
  const time = `${pad2(now.getUTCHours())}:${pad2(now.getUTCMinutes())}`;
  let result = String(template);
  result = result.replace(/\{dateTime\}/g, `${date} ${time}`);
  result = result.replace(/\{date\}/g, date);
  result = result.replace(/\{time\}/g, time);
  result = result.replace(/\{weekday\}/g, weekdayNameCn(now.getUTCDay()));
  for (const [key, value] of Object.entries(params || {})) {
    result = result.split(`{${key}}`).join(value);
  }
  return result;
}

/** 金标 generate_protocol_document（models/scheduler.rs:957-1018） */
function generateProtocolDocument(template, params, nowMs) {
  const now = nowMs === undefined ? new Date() : new Date(nowMs);
  const dateTime = `${now.getUTCFullYear()}-${pad2(now.getUTCMonth() + 1)}-${pad2(now.getUTCDate())} `
    + `${pad2(now.getUTCHours())}:${pad2(now.getUTCMinutes())}:${pad2(now.getUTCSeconds())}`;
  const mission = renderProtocolTemplate(template.protocolConfig.missionTemplate, params, nowMs);
  const categoryLabel = CATEGORY_LABELS[template.category] || template.category;

  let doc = `# 任务协议

> 任务ID: {{taskId}}
> 创建时间: ${dateTime}
> 模板类型: ${categoryLabel}
> 版本: 1.0.0

---

## 任务目标

${mission}

---

## 工作区

\`\`\`
{{workspacePath}}
\`\`\`

---

## 执行规则

${template.protocolConfig.executionRules || '按需执行任务'}
`;
  if (template.protocolConfig.customSections) {
    for (const section of template.protocolConfig.customSections) {
      const content = renderProtocolTemplate(section.template, params, nowMs);
      doc += `\n---\n\n## ${section.title}\n\n${content}\n`;
    }
  }
  if (template.protocolConfig.memoryRules) {
    doc += `\n---\n\n${renderProtocolTemplate(template.protocolConfig.memoryRules, params, nowMs)}`;
  }
  doc += '\n---\n\n## 补充\n\n> 用于临时调整任务方向或补充要求\n\n';
  doc += '\n---\n\n## 协议更新\n\n可修改本协议，修改时记录：\n- 修改内容\n- 修改原因\n- 预期效果\n';
  return doc;
}

const CATEGORY_LABELS = {
  development: 'Development',
  review: 'Review',
  news: 'News',
  monitor: 'Monitor',
  other: 'Other',
};

module.exports = {
  generateTimestamp, generateTaskPathFromTimestamp, generateTaskPath, extractTimestamp,
  generateProtocolMd, renderProtocolFromTemplate, generateSupplementMd,
  generateMemoryIndex, generateMemoryTasks, createTaskStructure,
  readProtocol, readSupplement, readMemoryIndex, readMemoryTasks, readAllMemory,
  updateProtocol, updateSupplement, updateMemoryIndex, updateMemoryTasks, clearSupplement,
  backupSupplement, backupDocument, deleteTaskStructure,
  extractUserContent, hasSupplementContent, countLines, needsBackup, buildProtocolPrompt,
  renderProtocolTemplate, generateProtocolDocument,
  BACKUP_LINE_THRESHOLD,
};
