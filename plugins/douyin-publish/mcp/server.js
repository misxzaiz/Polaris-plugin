#!/usr/bin/env node
/**
 * douyin-publish MCP Server
 *
 * 抖音视频自动发布流水线（辅助编排）+ 声音信息收集。
 * 协议：JSON-RPC 2.0 over stdio（MCP 2024-11-05）。
 *
 * 启动参数：
 *   node server.js [appConfigDir] [pluginDir]
 *
 * 设计说明：
 * - 本插件不直接操作浏览器。发布动作（打开上传页/点按钮/填标题/点发布/管理页确认）
 *   由 AI 通过 Polaris 内置浏览器（browser_* MCP）执行；本插件负责
 *   ① 文件登记与状态机（幂等） ② 原生文件对话框注入（ps1） ③ 声音信息收集（ffprobe）。
 * - 状态所有权：<pluginDir>/state/publish.json 单点写入（AGENTS.md §2.2 唯一权威）。
 *   记录按文件 sha256 索引；status=published 视为已发布，重复调用跳过。
 *
 * 工具：
 *   - douyin_prepare_publish   登记待发布视频（校验文件、算 sha256、写状态机）
 *   - douyin_pick_file         注入原生文件对话框（生成并执行 pick_file.ps1）
 *   - douyin_publish_status    查询/恢复发布状态（断点续跑的数据来源）
 *   - douyin_record_result     发布确认后登记 item_id/URL/状态
 *   - douyin_collect_audio     声音信息收集：ffprobe 提取音频元数据并归档
 *   - douyin_list_published    列出已发布记录
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { execFileSync, spawnSync } = require('child_process')

const SERVER_NAME = 'douyin-publish-mcp'
const SERVER_VERSION = '0.1.0'
const PROTOCOL_VERSION = '2024-11-05'

const PLUGIN_ID = 'douyin-publish'
const APP_CONFIG_DIR = process.argv[2] || ''
const PLUGIN_DIR = process.argv[3] || ''
const STATE_DIR = PLUGIN_DIR ? path.join(PLUGIN_DIR, 'state') : path.join(__dirname, '..', 'state')
const STATE_FILE = path.join(STATE_DIR, 'publish.json')
const SCRIPTS_DIR = path.join(__dirname, 'scripts')

// ── 配置读取（对齐 mimo-tts：每次调用读 config.json，面板保存即生效） ──────────

function defaultConfig() {
  return {
    ffprobePath: 'ffprobe',
    ffmpegPath: 'ffmpeg',
    douyinHomeUrl: 'https://creator.douyin.com/creator-micro/content/upload',
  }
}

function readPluginConfigFrom(dir) {
  if (!dir) return null
  try {
    const cfgPath = path.join(dir, 'config.json')
    if (!fs.existsSync(cfgPath)) return null
    const root = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
    return (root.plugins && root.plugins[PLUGIN_ID]) || null
  } catch (_) {
    return null
  }
}

function loadConfig() {
  const defaults = defaultConfig()
  const fallbackCandidates = [
    path.join(process.env.APPDATA || '', 'Polaris'),
    path.join(process.env.APPDATA || '', 'polaris'),
  ].filter(Boolean)
  const candidates = [...fallbackCandidates, APP_CONFIG_DIR].filter(
    (d, i, arr) => d && arr.indexOf(d) === i
  )
  const found = {}
  for (const dir of candidates) {
    const cfg = readPluginConfigFrom(dir)
    if (!cfg) continue
    for (const key of Object.keys(cfg)) {
      const val = cfg[key]
      if (typeof val === 'string' && val.trim() !== '') found[key] = val
      else if (typeof val !== 'string') found[key] = val
    }
  }
  return { ...defaults, ...found }
}

// ── 状态存储（单点权威） ───────────────────────────────────────────────────────

function ensureStateDir() {
  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true })
}

function readState() {
  ensureStateDir()
  if (!fs.existsSync(STATE_FILE)) return { version: 1, records: [] }
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
    if (!Array.isArray(raw.records)) return { version: 1, records: [] }
    return raw
  } catch (_) {
    return { version: 1, records: [] }
  }
}

function writeState(state) {
  ensureStateDir()
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8')
}

function findRecord(state, sha256) {
  return state.records.find((r) => r.sha256 === sha256) || null
}

function upsertRecord(state, rec) {
  const i = state.records.findIndex((r) => r.sha256 === rec.sha256)
  if (i >= 0) state.records[i] = { ...state.records[i], ...rec }
  else state.records.push(rec)
  writeState(state)
}

// ── 文件工具 ──────────────────────────────────────────────────────────────────

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

const VIDEO_EXTS = new Set(['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.m4v'])

function validateVideo(filePath) {
  if (!filePath) return { ok: false, error: 'file 不能为空' }
  const abs = path.resolve(filePath)
  if (!fs.existsSync(abs)) return { ok: false, error: '文件不存在: ' + abs }
  const stat = fs.statSync(abs)
  if (stat.isDirectory()) return { ok: false, error: '是目录，不是视频: ' + abs }
  const ext = path.extname(abs).toLowerCase()
  if (!VIDEO_EXTS.has(ext)) {
    return { ok: false, error: '不支持的视频扩展名: ' + ext + '（支持 ' + [...VIDEO_EXTS].join('/') + '）' }
  }
  return { ok: true, abs, sizeBytes: stat.size }
}

function ffprobeJson(ffprobe, filePath) {
  const out = execFileSync(ffprobe, [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    filePath,
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  return JSON.parse(out)
}

// ── 工具实现 ──────────────────────────────────────────────────────────────────

/** ① 登记待发布视频（幂等：sha256 相同复用记录） */
function handlePrepare(args) {
  const { file, title, description, topics } = args || {}
  const v = validateVideo(file)
  if (!v.ok) return { ok: false, error: v.error }

  const state = readState()
  const sha = sha256File(v.abs)
  let rec = findRecord(state, sha)
  const now = new Date().toISOString()

  if (!rec) {
    rec = {
      sha256: sha,
      file: v.abs,
      sizeBytes: v.sizeBytes,
      title: title || '',
      description: description || '',
      topics: Array.isArray(topics) ? topics : (typeof topics === 'string' && topics ? topics.split(/[,，、\s]+/) : []),
      status: 'pending', // pending → uploading → filling → publishing → published
      itemId: null,
      url: null,
      audio: null,
      audioSource: null,
      voiceId: null,
      createdAt: now,
      updatedAt: now,
    }
    state.records.push(rec)
    writeState(state)
  } else {
    // 已存在：仅当仍可编辑时更新元数据
    if (!['published', 'publishing'].includes(rec.status)) {
      if (title) rec.title = title
      if (description) rec.description = description
      if (Array.isArray(topics)) rec.topics = topics
      rec.updatedAt = now
      writeState(state)
    }
  }

  const skipped = rec.status === 'published'
  return {
    ok: true,
    sha256: sha,
    status: rec.status,
    skipped,
    skipReason: skipped ? '同一文件已发布，重复调用跳过（幂等）' : undefined,
    record: { ...rec },
  }
}

/** ② 生成并执行原生文件对话框注入脚本 → uploading */
function handlePickFile(args) {
  const { file } = args || {}
  const v = validateVideo(file)
  if (!v.ok) return { ok: false, error: v.error }
  if (!fs.existsSync(SCRIPTS_DIR)) return { ok: false, error: 'scripts 目录缺失: ' + SCRIPTS_DIR }

  const state = readState()
  const sha = sha256File(v.abs)
  let rec = findRecord(state, sha)
  if (rec && rec.status === 'published') {
    return { ok: false, error: '同 sha256 文件已 published，禁止重复发布；如需强推请更换文件', record: { ...rec } }
  }

  // 写参数化 ps1（不复用硬编码 hwnd；运行时枚举 #32770 对话框）
  // SCRIPTS_DIR 不在安装包内（运行时生成），确保目录存在
  if (!fs.existsSync(SCRIPTS_DIR)) fs.mkdirSync(SCRIPTS_DIR, { recursive: true })
  const scriptPath = path.join(SCRIPTS_DIR, 'pick_file.ps1')
  const ps1 = generatePickFileScript(v.abs)
  fs.writeFileSync(scriptPath, ps1, 'utf8')

  const res = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], {
    encoding: 'utf8',
    timeout: 30000,
  })
  const stdout = (res.stdout || '').toString()
  const stderr = (res.stderr || '').toString()

  if (res.status !== 0 || /ERR_|错误|Cannot find/i.test(stdout + stderr)) {
    return {
      ok: false,
      error: 'pick_file 脚本执行失败（status=' + res.status + '）',
      detail: (stdout + stderr).slice(0, 800),
      hint: '可能原因：文件对话框未弹出（先让 AI 点「上传视频」）、hwnd 枚举失败。参考 PLAN.md/README 诊断。',
      scriptPath,
    }
  }

  if (rec) {
    rec.status = 'uploading'
    rec.updatedAt = new Date().toISOString()
    writeState(state)
  }

  return {
    ok: true,
    scriptPath,
    stdout: stdout.trim().split('\n').filter(Boolean),
    status: rec ? rec.status : 'uploading',
    next: '等待 AI 轮询浏览器控制台出现 isUploading false 与文件名，然后填标题/描述后点发布',
  }
}

/** ③ 查询/恢复发布状态（断点续跑） */
function handleStatus(args) {
  const { file, sha256 } = args || {}
  const state = readState()
  let rec = null
  if (sha256) rec = findRecord(state, sha256)
  else if (file) {
    const v = validateVideo(file)
    if (v.ok) rec = findRecord(state, sha256File(v.abs))
  }
  if (!rec) return { ok: true, found: false, state: { version: state.version, count: state.records.length } }
  return { ok: true, found: true, record: { ...rec } }
}

/** ④ 发布确认后登记结果 */
function handleRecordResult(args) {
  const { file, sha256, itemId, url, status, note, audioSource, voiceId } = args || {}
  const state = readState()
  let rec = null
  if (sha256) rec = findRecord(state, sha256)
  else if (file) {
    const v = validateVideo(file)
    if (v.ok) rec = findRecord(state, sha256File(v.abs))
  }
  if (!rec) return { ok: false, error: '未找到对应发布记录，请先调用 douyin_prepare_publish 登记' }

  const allowed = ['published', 'failed', 'under_review', 'uploading', 'filling', 'publishing', 'cancelled']
  if (status && !allowed.includes(status)) {
    return { ok: false, error: '非法状态: ' + status + '（允许: ' + allowed.join('/') + '）' }
  }
  if (status === 'published' && !itemId && !url) {
    return { ok: false, error: '标记 published 必须提供 itemId 或 url（管理页确认后获取）' }
  }

  if (itemId) rec.itemId = itemId
  if (url) rec.url = url
  if (status) rec.status = status
  if (note) rec.note = note
  if (audioSource) rec.audioSource = audioSource
  if (voiceId) rec.voiceId = voiceId
  rec.updatedAt = new Date().toISOString()
  writeState(state)

  return { ok: true, record: { ...rec } }
}

/** ⑤ 声音信息收集：ffprobe 提取音频元数据（EBU R128 响度可选） */
function handleCollectAudio(args) {
  const { file, sha256, audioSource, voiceId } = args || {}
  const cfg = loadConfig()
  const state = readState()
  let rec = null
  if (sha256) rec = findRecord(state, sha256)
  else if (file) {
    const v = validateVideo(file)
    if (v.ok) rec = findRecord(state, sha256File(v.abs))
  }
  if (!rec) return { ok: false, error: '未找到对应发布记录，请先调用 douyin_prepare_publish 登记' }
  if (!fs.existsSync(rec.file)) return { ok: false, error: '视频文件不存在（可能已移动）: ' + rec.file }

  let audio = null
  try {
    const probe = ffprobeJson(cfg.ffprobePath, rec.file)
    const aStreams = (probe.streams || []).filter((s) => s.codec_type === 'audio')
    const vStream = (probe.streams || []).find((s) => s.codec_type === 'video')
    const fmt = probe.format || {}

    audio = {
      hasAudioTrack: aStreams.length > 0,
      audioCodec: aStreams[0] ? aStreams[0].codec_name : null,
      audioBitrateKbps: aStreams[0] && aStreams[0].bit_rate ? Math.round(Number(aStreams[0].bit_rate) / 1000) : null,
      audioSampleRateHz: aStreams[0] && aStreams[0].sample_rate ? Number(aStreams[0].sample_rate) : null,
      audioDurationSec: aStreams[0] && aStreams[0].duration ? Math.round(Number(aStreams[0].duration) * 100) / 100 : null,
      videoResolution: vStream ? vStream.width + 'x' + vStream.height : null,
      formatDurationSec: fmt.duration ? Math.round(Number(fmt.duration) * 100) / 100 : null,
      formatBitrateKbps: fmt.bit_rate ? Math.round(Number(fmt.bit_rate) / 1000) : null,
      loudnessLufs: null,
    }

    // EBU R128 响度（ffmpeg 存在时）
    if (audio.hasAudioTrack && cfg.ffmpegPath) {
      try {
        const out = execFileSync(cfg.ffmpegPath, [
          '-i', rec.file, '-af', 'ebur128=peak=true', '-f', 'null', '-',
        ], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
        const m = out.match(/I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/)
        if (m) audio.loudnessLufs = Number(m[1])
      } catch (_) {
        audio.loudnessLufs = null // ffmpeg 缺 ebur128 滤波器/过期版本时静默降级
      }
    }
  } catch (e) {
    return { ok: false, error: 'ffprobe 解析失败: ' + e.message }
  }

  rec.audio = audio
  if (audioSource) rec.audioSource = audioSource
  if (voiceId) rec.voiceId = voiceId
  rec.updatedAt = new Date().toISOString()
  writeState(state)

  return { ok: true, audio, audioSource: rec.audioSource || null, voiceId: rec.voiceId || null }
}

/** ⑥ 列出发布记录 */
function handleListPublished(args) {
  const state = readState()
  const { limit = 50, status } = args || {}
  let list = state.records
  if (status) list = list.filter((r) => r.status === status)
  list = list.slice(-Number(limit)).reverse()
  const summary = list.map((r) => ({
    file: r.file,
    title: r.title || '(无题)',
    status: r.status,
    itemId: r.itemId,
    url: r.url,
    durationSec: r.audio ? (r.audio.formatDurationSec != null ? r.audio.formatDurationSec : r.audio.audioDurationSec) : null,
    hasAudio: r.audio ? r.audio.hasAudioTrack : null,
    audioSource: r.audioSource || null,
    publishedAt: r.status === 'published' ? r.updatedAt : null,
  }))
  return { ok: true, count: summary.length, total: state.records.length, records: summary }
}

// ── 工具注册表 ────────────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'douyin_prepare_publish',
    description: '登记待发布视频到发布状态机（幂等：同 sha256 已 published 自动跳过）。校验文件存在/扩展名/大小，生成状态记录，供后续断点续跑。',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: '视频文件路径，如 D:/space/base/Polaris/temp/claude-animation-base/out/duyu.mp4' },
        title: { type: 'string', description: '发布标题（如「水墨动画测试」）' },
        description: { type: 'string', description: '作品描述' },
        topics: { type: 'array', items: { type: 'string' }, description: '话题标签数组，如 ["水墨","原创"]' },
      },
      required: ['file'],
    },
  },
  {
    name: 'douyin_pick_file',
    description: '注入原生文件对话框选择视频：生成参数化 pick_file.ps1（实时枚举 #32770 对话框 + 写路径 + 点打开）并执行。前置：AI 已点「上传视频」使对话框弹出。返回值含 stdout 与 next 指引。',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: '要选择的视频文件绝对路径' },
      },
      required: ['file'],
    },
  },
  {
    name: 'douyin_publish_status',
    description: '查询发布状态（按 file 或 sha256）。用于断点续跑：中途中断后先查状态，再决定从哪一步继续。',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: '视频文件路径（与 sha256 二选一）' },
        sha256: { type: 'string', description: '文件 sha256（与 file 二选一）' },
      },
    },
  },
  {
    name: 'douyin_record_result',
    description: '发布管理页确认后登记结果：item_id/url/状态（published/failed/under_review 等）。标记 published 必须提供 itemId 或 url（防误标）。',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: '视频文件路径' },
        sha256: { type: 'string', description: '文件 sha256（优先）' },
        itemId: { type: 'string', description: '抖音作品 item_id（create_v2 响应或管理页抓取）' },
        url: { type: 'string', description: '作品链接' },
        status: { type: 'string', description: 'published/failed/under_review/uploading/filling/publishing/cancelled' },
        note: { type: 'string', description: '备注（如审核提示）' },
        audioSource: { type: 'string', description: '声音来源（tts/voiceclone/bgm/人工），供声音资产追踪' },
        voiceId: { type: 'string', description: '音色标识（如 冰糖/白桦/克隆ID），供旁白一致性' },
      },
      required: ['status'],
    },
  },
  {
    name: 'douyin_collect_audio',
    description: '声音信息收集：用 ffprobe 提取视频音频流元数据（有无音轨/编码/采样率/时长/分辨率/EBU R128 响度），归档到发布记录。支持登记 audioSource/voiceId 溯源。',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: '视频文件路径' },
        sha256: { type: 'string', description: '文件 sha256（优先）' },
        audioSource: { type: 'string', description: '声音来源（tts/voiceclone/bgm/人工音效/无）' },
        voiceId: { type: 'string', description: '音色标识（冰糖/白桦/克隆ID 等）' },
      },
    },
  },
  {
    name: 'douyin_list_published',
    description: '列出发布记录（倒序），可选按 status 过滤。返回文件/标题/状态/itemId/url/音频摘要。',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: '返回条数，默认 50' },
        status: { type: 'string', description: '按状态过滤：published/failed/under_review 等' },
      },
    },
  },
]

// ── ps1 生成（把 temp/ 下硬编码脚本参数化） ───────────────────────────────────
// 注意：ps1 内容含 $_ 等，必须用普通字符串拼接生成，禁止模板字符串避免 JS 插值。

function generatePickFileScript(filePath) {
  const esc = filePath.replace(/'/g, "''")
  const ps1 = [
    '# 参数化原生文件对话框注入（运行时枚举 hwnd，每次不同）',
    '# 由 douyin-publish 插件生成并执行；无硬编码 hwnd',
    'Add-Type @"',
    'using System;',
    'using System.Collections.Generic;',
    'using System.Runtime.InteropServices;',
    'using System.Text;',
    'public class PickDlg {',
    '    public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);',
    '    public delegate bool EnumChildProc(IntPtr hwnd, IntPtr lParam);',
    '    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr lParam);',
    '    [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr hwndParent, EnumChildProc cb, IntPtr lParam);',
    '    [DllImport("user32.dll")] public static extern int GetClassName(IntPtr hWnd, StringBuilder sb, int max);',
    '    [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder sb, int max);',
    '    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);',
    '    [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);',
    '    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr SendMessageW(IntPtr hWnd, uint Msg, IntPtr wParam, string lParam);',
    '    public static IntPtr dlg = IntPtr.Zero;',
    '    static bool EnumCb(IntPtr h, IntPtr l) {',
    '        var c = new StringBuilder(256); GetClassName(h, c, 256);',
    '        if (IsWindowVisible(h) && c.ToString() == "#32770") { dlg = h; return false; }',
    '        return true;',
    '    }',
    '    public static IntPtr FindDialog() {',
    '        dlg = IntPtr.Zero;',
    '        EnumWindows(EnumCb, IntPtr.Zero);',
    '        return dlg;',
    '    }',
    '    public static string Describe(IntPtr parent) {',
    '        var res = new List<string>();',
    '        EnumChildWindows(parent, (h, l) => {',
    '            var c = new StringBuilder(256); GetClassName(h, c, 256);',
    '            var t = new StringBuilder(512); GetWindowText(h, t, 512);',
    '            res.Add("hwnd=" + h + " class=" + c.ToString() + " text=[" + t.ToString() + "]");',
    '            return true;',
    '        }, IntPtr.Zero);',
    '        return string.Join("\n", res.ToArray());',
    '    }',
    '}',
    '"@',
    '$dlg = [PickDlg]::FindDialog()',
    'if ($dlg -eq [IntPtr]::Zero) { Write-Output "ERR_NO_DIALOG"; exit 1 }',
    'Start-Sleep -Milliseconds 300',
    '# 找文件名 Edit（类 Edit 且可见）与「打开」按钮',
    '$edit = [IntPtr]::Zero',
    '$openBtn = [IntPtr]::Zero',
    '[PickDlg]::Describe($dlg).Split("`n") | ForEach-Object {',
    '    if ($_ -match "hwnd=(\\d+) class=Edit ") {',
    '        if ($edit -eq [IntPtr]::Zero) { $edit = [IntPtr][long]$Matches[1] }',
    '    }',
    '    if ($_ -match "hwnd=(\\d+) class=Button .*打开") {',
    '        if ($openBtn -eq [IntPtr]::Zero) { $openBtn = [IntPtr][long]$Matches[1] }',
    '    }',
    '}',
    'if ($edit -eq [IntPtr]::Zero) { Write-Output "ERR_NO_EDIT"; exit 1 }',
    '# WM_SETTEXT = 0x000C',
    '[PickDlg]::SendMessageW($edit, 0x000C, [IntPtr]::Zero, \'' + esc + '\') | Out-Null',
    'Write-Output "SET_TEXT_DONE"',
    'if ($openBtn -ne [IntPtr]::Zero) {',
    '    # BM_CLICK = 0x00F5',
    '    [PickDlg]::SendMessage($openBtn, 0x00F5, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null',
    '    Write-Output "CLICK_DONE"',
    '} else {',
    '    # 无打开按钮：对 Edit 发送 Enter 兜底（WM_KEYDOWN 0x0100）',
    '    [PickDlg]::SendMessage($edit, 0x0100, [IntPtr][int]13, [IntPtr]::Zero) | Out-Null',
    '    Write-Output "NO_OPEN_BUTTON_SENT_ENTER"',
    '}',
  ].join('\n')
  return ps1
}

// ── MCP 协议处理（JSON-RPC 2.0 over stdio） ─────────────────────────────────

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n')
}

const handlerByTool = {
  douyin_prepare_publish: handlePrepare,
  douyin_pick_file: handlePickFile,
  douyin_publish_status: handleStatus,
  douyin_record_result: handleRecordResult,
  douyin_collect_audio: handleCollectAudio,
  douyin_list_published: handleListPublished,
}

let buf = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  buf += chunk
  while (true) {
    const i = buf.indexOf('\n')
    if (i === -1) break
    const line = buf.slice(0, i).trim()
    buf = buf.slice(i + 1)
    if (!line) continue

    let msg
    try {
      msg = JSON.parse(line)
    } catch (_) {
      continue
    }

    if (msg.method === 'initialize') {
      send({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        },
      })
    } else if (msg.method === 'notifications/initialized') {
      // no-op
    } else if (msg.method === 'tools/list') {
      send({ jsonrpc: '2.0', id: msg.id, result: { tools: TOOLS } })
    } else if (msg.method === 'tools/call') {
      const toolName = msg.params && msg.params.name
      const args = (msg.params && msg.params.arguments) || {}
      const handler = handlerByTool[toolName]
      if (!handler) {
        send({
          jsonrpc: '2.0',
          id: msg.id,
          result: { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: '未知工具: ' + toolName }) }], isError: true },
        })
        continue
      }
      try {
        const result = handler(args)
        send({
          jsonrpc: '2.0',
          id: msg.id,
          result: { content: [{ type: 'text', text: JSON.stringify(result) }] },
        })
      } catch (e) {
        send({
          jsonrpc: '2.0',
          id: msg.id,
          result: { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: e.message }) }], isError: true },
        })
      }
    } else if (msg.method === 'ping') {
      send({ jsonrpc: '2.0', id: msg.id, result: {} })
    }
  }
})

process.stderr.write('[douyin-publish] MCP server started, pluginDir=' + PLUGIN_DIR + ', stateDir=' + STATE_DIR + '\n')
