#!/usr/bin/env node
/**
 * polaris-git MCP Server
 *
 * 把 git 操作暴露给 AI（Claude Code / SimpleAI / 任意 MCP 客户端）。
 * 实现方式：child_process 调系统 git CLI。无原生依赖，跨平台。
 *
 * 工具：
 *   - git_status(workspacePath)            仓库状态（分支/staged/unstaged/untracked）
 *   - git_diff(workspacePath, staged?, filePath?)    工作区/暂存区 diff
 *   - git_log(workspacePath, limit?)        提交历史
 *   - git_stage(workspacePath, filePath)    暂存文件
 *   - git_commit(workspacePath, message)    提交
 *   - git_create_branch(workspacePath, name, checkout?)  创建分支
 *   - git_checkout(workspacePath, ref)      切换分支/提交
 *   - git_pull(workspacePath)               拉取
 *   - git_push(workspacePath, remote?)      推送
 *   - git_blame(workspacePath, filePath, lineStart?, lineEnd?)  文件 blame
 *   - git_stash_list / git_stash_pop / git_stash_drop
 *   - git_repo_info(workspacePath)          仓库根/当前分支/HEAD
 *
 * JSON-RPC 2.0 over stdin/stdout。workspacePath 未传时尝试用 cwd。
 */
const { execFile } = require('child_process')

function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n') }

/** 执行 git 命令，返回 { stdout }，抛错含 stderr */
function git(args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile('git', args, {
      cwd: opts.cwd || process.cwd(),
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
      timeout: opts.timeout || 120000,
    }, (err, stdout, stderr) => {
      if (err) {
        const detail = (stderr || err.message || '').trim()
        reject(new Error(`git ${args[0]} 失败: ${detail}`))
        return
      }
      resolve(stdout)
    })
  })
}

/** 解析本地仓库信息（无需 git 命令，读 .git/HEAD） */
function getRepoInfo(cwd) {
  try {
    const head = require('fs').readFileSync(require('path').join(cwd, '.git', 'HEAD'), 'utf8').trim()
    let branch = null
    let ref = null
    if (head.startsWith('ref: ')) {
      ref = head.slice(5)
      branch = ref.replace('refs/heads/', '')
    }
    return { isRepo: true, branch, ref }
  } catch {
    return { isRepo: false }
  }
}

async function parseStatus(workspacePath) {
  const root = await git(['rev-parse', '--show-toplevel'], { cwd: workspacePath })
  const branch = (await git(['branch', '--show-current'], { cwd: workspacePath })).trim()
  const statusPorcelain = (await git(['status', '--porcelain', '-z'], { cwd: workspacePath }))
    .replace(/\0/g, '\n').trim()
  const staged = [], unstaged = [], untracked = [], conflicted = []
  for (const line of statusPorcelain.split('\n')) {
    if (!line) continue
    const xy = line.slice(0, 2)
    const file = line.slice(3)
    if (xy.includes('U') || xy === 'AA' || xy === 'DD') conflicted.push(file)
    if (xy[1] !== ' ' && xy[1] !== '?') staged.push(file)
    else if (xy[0] === '?') untracked.push(file)
    else if (xy[0] !== ' ' && xy[0] !== '?') unstaged.push(file)
  }
  const aheadBehind = (await git(['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'], { cwd: workspacePath }))
    .trim().split(/\s+/)
  return {
    workspacePath: root.trim(),
    exists: true,
    branch,
    staged,
    unstaged,
    untracked,
    conflicted,
    ahead: Number(aheadBehind[0] || 0),
    behind: Number(aheadBehind[1] || 0),
  }
}

async function parseDiff(workspacePath, staged, filePath) {
  const args = ['diff', '--no-color', '--no-ext-diff']
  if (staged) args.push('--cached')
  else if (!staged) args.push('--')
  if (filePath) args.push(filePath)
  return args
}

const tools = [
  {
    name: 'git_status',
    description: '查看 Git 仓库状态：当前分支、已暂存/未暂存/未跟踪文件、领先/落后远程提交数。',
    inputSchema: {
      type: 'object',
      properties: { workspacePath: { type: 'string', description: '仓库工作目录（缺省用 cwd）' } }
    }
  },
  {
    name: 'git_diff',
    description: '查看工作区或暂存区 diff（统一格式，无 ANSI 色）。可指定单个文件。',
    inputSchema: {
      type: 'object',
      properties: {
        workspacePath: { type: 'string', description: '仓库工作目录' },
        staged: { type: 'boolean', description: '查看暂存区 diff（--cached），默认 false 查看工作区' },
        filePath: { type: 'string', description: '限定单个文件（相对仓库根）' }
      }
    }
  },
  {
    name: 'git_log',
    description: '查看提交历史（默认最近 20 条）。',
    inputSchema: {
      type: 'object',
      properties: {
        workspacePath: { type: 'string', description: '仓库工作目录' },
        limit: { type: 'number', description: '条数，默认 20' }
      }
    }
  },
  {
    name: 'git_stage',
    description: '暂存指定文件（git add）。传 . 或全部文件名可暂存全部。',
    inputSchema: {
      type: 'object',
      properties: {
        workspacePath: { type: 'string', description: '仓库工作目录' },
        filePath: { type: 'string', description: '要暂存的文件路径（相对仓库根），"." 表示全部' }
      },
      required: ['filePath']
    }
  },
  {
    name: 'git_commit',
    description: '创建提交。注意：commit 是高风险操作，先确认 message 与 staged 内容。',
    inputSchema: {
      type: 'object',
      properties: {
        workspacePath: { type: 'string', description: '仓库工作目录' },
        message: { type: 'string', description: '提交信息' }
      },
      required: ['message']
    }
  },
  {
    name: 'git_create_branch',
    description: '创建新分支（可选关联远程）。',
    inputSchema: {
      type: 'object',
      properties: {
        workspacePath: { type: 'string', description: '仓库工作目录' },
        name: { type: 'string', description: '新分支名' },
        checkout: { type: 'boolean', description: '创建后立即切换，默认 false' }
      },
      required: ['name']
    }
  },
  {
    name: 'git_checkout',
    description: '切换分支或提交（detached）。',
    inputSchema: {
      type: 'object',
      properties: {
        workspacePath: { type: 'string', description: '仓库工作目录' },
        ref: { type: 'string', description: '分支名 / 标签 / 提交 SHA' }
      },
      required: ['ref']
    }
  },
  {
    name: 'git_pull',
    description: '拉取远程变更（git pull）。网络操作。',
    inputSchema: {
      type: 'object',
      properties: { workspacePath: { type: 'string', description: '仓库工作目录' } }
    }
  },
  {
    name: 'git_push',
    description: '推送当前分支到远程（首次推送加 -u）。网络操作，可能被拒绝。',
    inputSchema: {
      type: 'object',
      properties: {
        workspacePath: { type: 'string', description: '仓库工作目录' },
        setUpstream: { type: 'boolean', description: '首次推送设置上游，默认 false' }
      }
    }
  },
  {
    name: 'git_blame',
    description: '查看文件某行的最后一次提交（作者/时间/消息）。',
    inputSchema: {
      type: 'object',
      properties: {
        workspacePath: { type: 'string', description: '仓库工作目录' },
        filePath: { type: 'string', description: '文件路径（相对仓库根）' }
      },
      required: ['filePath']
    }
  },
  {
    name: 'git_stash_list',
    description: '列出 stash 列表。',
    inputSchema: {
      type: 'object',
      properties: { workspacePath: { type: 'string', description: '仓库工作目录' } }
    }
  },
  {
    name: 'git_stash_pop',
    description: '恢复最近 stash。',
    inputSchema: {
      type: 'object',
      properties: { workspacePath: { type: 'string', description: '仓库工作目录' } }
    }
  },
  {
    name: 'git_repo_info',
    description: '获取仓库根目录、当前分支、HEAD 引用。',
    inputSchema: {
      type: 'object',
      properties: { workspacePath: { type: 'string', description: '仓库工作目录' } }
    }
  },
]

async function handleTool(name, args) {
  const cwd = args?.workspacePath || process.cwd()
  const resolvePath = (p) => (p === '.' || !p) ? cwd : require('path').resolve(cwd, p)

  switch (name) {
    case 'git_status':
      return { content: [{ type: 'text', text: JSON.stringify(await parseStatus(cwd), null, 2) }] }
    case 'git_diff': {
      const parts = ['diff', '--no-color', '--no-ext-diff', '--stat']
      if (args?.staged) parts.push('--cached')
      const stat = await git(parts.filter(Boolean), { cwd }).catch(() => '')
      const full = ['diff', '--no-color', '--no-ext-diff']
      if (args?.staged) full.push('--cached')
      if (args?.filePath) full.push('--', args.filePath)
      const body = await git(full, { cwd })
      return { content: [{ type: 'text', text: `${stat ? '### 变更统计\n' + stat + '\n' : ''}### Diff\n${body}` }], isError: false }
    }
    case 'git_log': {
      const limit = Number(args?.limit || 20)
      const out = await git(['log', '--pretty=format:%h|%an|%ad|%s', `-${limit}`, '--date=short'], { cwd })
      const rows = out.split('\n').filter(Boolean).map((line) => {
        const [hash, author, date, ...msg] = line.split('|')
        return { hash, author, date, message: msg.join('|') }
      })
      return { content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }] }
    }
    case 'git_stage': {
      const file = args?.filePath || '.'
      await git(['add', '--', file], { cwd })
      return { content: [{ type: 'text', text: `已暂存: ${file}` }], isError: false }
    }
    case 'git_commit': {
      const out = await git(['commit', '-m', args.message], { cwd })
      return { content: [{ type: 'text', text: out.trim() }], isError: false }
    }
    case 'git_create_branch': {
      await git(['branch', args.name], { cwd })
      if (args?.checkout) await git(['checkout', args.name], { cwd })
      return { content: [{ type: 'text', text: `分支 ${args.name} 已创建${args?.checkout ? ' 并切换' : ''}` }], isError: false }
    }
    case 'git_checkout': {
      await git(['checkout', args.ref], { cwd })
      return { content: [{ type: 'text', text: `已切换到 ${args.ref}` }], isError: false }
    }
    case 'git_pull': {
      const out = await git(['pull'], { cwd })
      return { content: [{ type: 'text', text: out.trim() }], isError: false }
    }
    case 'git_push': {
      const out = args?.setUpstream
        ? await git(['push', '-u', 'origin', 'HEAD'], { cwd })
        : await git(['push'], { cwd })
      return { content: [{ type: 'text', text: out.trim() }], isError: false }
    }
    case 'git_blame': {
      const out = await git(['blame', '--line-porcelain', '--', args.filePath], { cwd })
      const lines = parseBlame(out)
      return { content: [{ type: 'text', text: JSON.stringify(lines, null, 2) }] }
    }
    case 'git_stash_list': {
      const out = await git(['stash', 'list'], { cwd }).catch(() => '')
      return { content: [{ type: 'text', text: out.trim() || '（无 stash）' }] }
    }
    case 'git_stash_pop': {
      const out = await git(['stash', 'pop'], { cwd })
      return { content: [{ type: 'text', text: out.trim() }], isError: false }
    }
    case 'git_repo_info': {
      const info = getRepoInfo(cwd)
      if (!info.isRepo) return { content: [{ type: 'text', text: JSON.stringify({ isRepo: false, cwd }) }] }
      const root = (await git(['rev-parse', '--show-toplevel'], { cwd })).trim()
      return { content: [{ type: 'text', text: JSON.stringify({ isRepo: true, branch: info.branch, headRef: info.ref, root }) }] }
    }
    default:
      return { content: [{ type: 'text', text: `未知工具: ${name}` }], isError: true }
  }
}

/** 解析 git blame --line-porcelain 输出为数组 */
function parseBlame(out) {
  const fileLinePattern = /^([0-9a-f]+)\s(\d+)\s(\d+)\s(\d+)/
  const authorRe = /^author (.+)$/
  const dateRe = /^author-time (\d+)$/
  const summRe = /^summary (.+)$/

  const lines = out.split('\n')
  const result = []
  let i = 0
  while (i < lines.length) {
    const m = lines[i].match(fileLinePattern)
    if (!m) { i++; continue }
    const [, sha, origLine, finalLine] = m
    const entry = {
      commitSha: sha,
      shortSha: sha.slice(0, 8),
      originalLineNumber: Number(origLine),
      lineNumber: Number(finalLine),
    }
    for (let j = i + 1; j < Math.min(lines.length, i + 12); j++) {
      const a = lines[j].match(authorRe)
      if (a && entry.author === undefined) entry.author = a[1]
      const d = lines[j].match(dateRe)
      if (d && entry.timestamp === undefined) entry.timestamp = Number(d[1])
      const s = lines[j].match(summRe)
      if (s && entry.summary === undefined) entry.summary = s[1]
      if (lines[j] === '\t') break
    }
    result.push(entry)
    i++
  }
  return result
}

// ─── JSON-RPC 2.0 stdio 入口 ─────────────────────────
const { stdin } = process
let buffer = ''
stdin.setEncoding('utf8')
stdin.on('data', async (chunk) => {
  buffer += chunk
  let nl
  while ((nl = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, nl).trim()
    buffer = buffer.slice(nl + 1)
    if (!line) continue
    let req
    try { req = JSON.parse(line) } catch { continue }
    if (req.method === 'initialize') {
      send({ jsonrpc: '2.0', id: req.id, result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'polaris-git', version: '0.1.0' }
      } })
      continue
    }
    if (req.method === 'notifications/initialized') continue
    if (req.method === 'tools/list') {
      send({ jsonrpc: '2.0', id: req.id, result: { tools } })
      continue
    }
    if (req.method === 'tools/call') {
      const name = req.params?.name
      const args = req.params?.arguments
      try {
        const result = await handleTool(name, args)
        send({ jsonrpc: '2.0', id: req.id, result })
      } catch (e) {
        send({ jsonrpc: '2.0', id: req.id, result: {
          content: [{ type: 'text', text: e instanceof Error ? e.message : String(e) }],
          isError: true
        } })
      }
      continue
    }
    // 未知方法
    send({ jsonrpc: '2.0', id: req.id, error: { code: -32601, message: `未知方法: ${req.method}` } })
  }
})

// 独立运行模式：node server.js --tool git_status --args '<json>' 打印结果后退出
if (process.argv.includes('--tool')) {
  const ti = process.argv.indexOf('--tool')
  const tool = process.argv[ti + 1]
  const argsIdx = process.argv.indexOf('--args')
  const args = argsIdx !== -1 ? JSON.parse(process.argv[argsIdx + 1] || '{}') : {}
  handleTool(tool, args).then((r) => {
    process.stdout.write('\n' + JSON.stringify(r, null, 2) + '\n')
    process.exit(0)
  }).catch((e) => { process.stderr.write(String(e)); process.exit(1) })
}