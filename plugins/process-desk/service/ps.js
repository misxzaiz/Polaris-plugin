'use strict';
/**
 * ps.js —— PowerShell 封装层（零依赖）
 *
 * 设计要点（对接 house 踩坑记忆）：
 *  - 脚本落盘必须 UTF-8 带 BOM：PowerShell 对无 BOM 文件按 ANSI/GBK 解析，中文注释直接碎掉
 *  - 所有入参经 base64(JSON) 传入 -ArgJson：彻底绕开引号/空格/中文路径的转义地狱
 *  - 脚本第一行把 [Console]::OutputEncoding 设为 UTF-8：中文 Windows 控制台默认 GBK，
 *    不设则进程名/路径里的中文在 stdout 变乱码
 *  - execFile 直启 powershell.exe（不走 shell），windowsHide，带超时与 maxBuffer
 *  - $pid 是 PowerShell 保留自动变量，脚本内一律用 $pidToKill 之类的名字
 */
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const core = require('../shared/core');

const POWERSHELL = path.join(
  process.env.SystemRoot || 'C:\\Windows',
  'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe',
);

const SCRIPTS = {
  'procs.ps1': `param([string]$ArgJson = '')
$ErrorActionPreference = 'SilentlyContinue'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
$opt = $null
try { $opt = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($ArgJson)) | ConvertFrom-Json } catch {}
$wantPids = @()
if ($opt -and $opt.pids) { $wantPids = @($opt.pids | ForEach-Object { [int]$_ }) }
$map = @{}
Get-Process | ForEach-Object { if ($_.Id -gt 0) { $map[[int]$_.Id] = $_ } }
$wmiList = $null
if ($wantPids.Count -gt 0) {
  $filter = ($wantPids | ForEach-Object { "ProcessId=$_" }) -join ' OR '
  $wmiList = Get-CimInstance Win32_Process -Filter $filter
} else {
  $wmiList = Get-CimInstance Win32_Process
}
$out = New-Object System.Collections.Generic.List[object]
foreach ($w in $wmiList) {
  $p = $null
  if ($map.ContainsKey([int]$w.ProcessId)) { $p = $map[[int]$w.ProcessId] }
  $started = $null
  if ($w.CreationDate) { try { $started = $w.CreationDate.ToString('o') } catch {} }
  $cpu = $null; $ws = 0
  if ($p) {
    if ($null -ne $p.CPU) { try { $cpu = [math]::Round([double]$p.CPU, 1) } catch {} }
    try { $ws = [int64]$p.WorkingSet64 } catch { $ws = 0 }
  }
  $out.Add([pscustomobject]@{
    pid = [int]$w.ProcessId
    ppid = [int]$w.ParentProcessId
    name = $w.Name
    cmd = $w.CommandLine
    path = $w.ExecutablePath
    started = $started
    cpu = $cpu
    ws = $ws
  })
}
ConvertTo-Json -InputObject @($out) -Compress -Depth 3
`,

  'lockers.ps1': `param([string]$ArgJson = '')
$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
$opt = $null
try { $opt = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($ArgJson)) | ConvertFrom-Json } catch {}
$path = ''
if ($opt -and $opt.path) { $path = [string]$opt.path }
$result = [pscustomobject]@{ path = $path; locked = $false; lockers = @(); error = $null }

if (-not $path -or -not (Test-Path -LiteralPath $path)) {
  $result.error = 'path_not_found'
  ConvertTo-Json -InputObject $result -Compress -Depth 4
  exit 0
}

$src = @"
using System;
using System.Runtime.InteropServices;

public static class PdeskRm {
  [StructLayout(LayoutKind.Sequential)]
  public struct RM_UNIQUE_PROCESS { public int dwProcessId; public System.Runtime.InteropServices.ComTypes.FILETIME ProcessStartTime; }
  public const int CCH_RM_MAX_APP_NAME = 255;
  public const int CCH_RM_MAX_SVC_NAME = 63;
  public enum RM_APP_TYPE { RmUnknownApp = 0, RmMainWindow = 1, RmOtherWindow = 2, RmService = 3, RmExplorer = 4, RmConsole = 5, RmCritical = 1000 }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct RM_PROCESS_INFO {
    public RM_UNIQUE_PROCESS Process;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = CCH_RM_MAX_APP_NAME + 1)] public string strAppName;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = CCH_RM_MAX_SVC_NAME + 1)] public string strServiceShortName;
    public RM_APP_TYPE ApplicationType;
    public uint AppStatus;
    public uint TSSessionId;
    [MarshalAs(UnmanagedType.Bool)] public bool bRestartable;
  }
  [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)]
  public static extern int RmStartSession(out uint pSessionHandle, int dwSessionFlags, string strSessionKey);
  [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)]
  public static extern int RmRegisterResources(uint pSessionHandle, uint nFiles, string[] rgsFileNames, uint nApplications, RM_UNIQUE_PROCESS[] rgApplications, uint nServices, string[] rgsServiceNames);
  [DllImport("rstrtmgr.dll")]
  public static extern int RmGetList(uint dwSessionHandle, out uint pnProcInfoNeeded, ref uint pnProcInfo, [In, Out] RM_PROCESS_INFO[] rgAffectedApps, ref uint lpdwRebootReasons);
  [DllImport("rstrtmgr.dll")]
  public static extern int RmEndSession(uint pSessionHandle);
}
"@
try { Add-Type -TypeDefinition $src -Language CSharp } catch { if ($_.Exception.Message -notmatch 'already exists|已存在') { $result.error = $_.Exception.Message; ConvertTo-Json -InputObject $result -Compress -Depth 4; exit 0 } }

$lockers = New-Object System.Collections.Generic.List[object]
try {
  $handle = [uint32]0
  $key = [Guid]::NewGuid().ToString()
  $hr = [PdeskRm]::RmStartSession([ref]$handle, 0, $key)
  if ($hr -ne 0) { throw "RmStartSession 失败 hr=$hr" }
  try {
    $needed = [uint32]0; $count = [uint32]0; $reasons = [uint32]0
    $hr = [PdeskRm]::RmRegisterResources($handle, 1, @($path), 0, $null, 0, $null)
    if ($hr -ne 0) { throw "RmRegisterResources 失败 hr=$hr" }
    $hr = [PdeskRm]::RmGetList($handle, [ref]$needed, [ref]$count, $null, [ref]$reasons)
    if ($hr -eq 234) {
      $info = New-Object 'PdeskRm+RM_PROCESS_INFO[]' -ArgumentList ([int]$needed)
      $count = $needed
      $hr = [PdeskRm]::RmGetList($handle, [ref]$needed, [ref]$count, $info, [ref]$reasons)
      if ($hr -ne 0) { throw "RmGetList 失败 hr=$hr" }
      for ($i = 0; $i -lt [int]$count; $i++) {
        $lockers.Add([pscustomobject]@{ pid = [int]$info[$i].Process.dwProcessId; app = $info[$i].strAppName; type = [string]$info[$i].ApplicationType })
      }
    } elseif ($hr -ne 0) { throw "RmGetList 失败 hr=$hr" }
  } finally { [void][PdeskRm]::RmEndSession($handle) }
} catch {
  $result.error = $_.Exception.Message
}
$result.lockers = @($lockers)
if ($lockers.Count -gt 0) { $result.locked = $true }
ConvertTo-Json -InputObject $result -Compress -Depth 4
`,

  'kill.ps1': `param([string]$ArgJson = '')
$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
$opt = $null
try { $opt = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($ArgJson)) | ConvertFrom-Json } catch {}
$pidToKill = 0
if ($opt -and $opt.pid) { try { $pidToKill = [int]$opt.pid } catch {} }
$out = [pscustomobject]@{ ok = $false; error = $null }
try {
  Get-Process -Id $pidToKill -ErrorAction Stop | Out-Null
  Stop-Process -Id $pidToKill -Force -ErrorAction Stop
  $out.ok = $true
} catch {
  $out.error = $_.Exception.Message
}
ConvertTo-Json -InputObject $out -Compress -Depth 3
`,
};

let psDir = null;
function ensureScript(name) {
  if (!psDir) {
    psDir = path.join(os.tmpdir(), 'pdesk-ps');
    try { fs.mkdirSync(psDir, { recursive: true }); } catch (_) { /* tmp 不可写时退化为内存失败 */ }
  }
  const p = path.join(psDir, name);
  const want = SCRIPTS[name];
  try {
    const cur = fs.readFileSync(p, 'utf8');
    if (cur.replace(/^\uFEFF/, '') === want) return p;
  } catch (_) { /* 不存在即首轮 */ }
  // 带 BOM 写入：PowerShell 对无 BOM 的 UTF-8 文件按 ANSI/GBK 解析，中文注释会碎
  fs.writeFileSync(p, `\uFEFF${want}`, 'utf8');
  return p;
}

function encodeArg(obj) {
  return Buffer.from(JSON.stringify(obj || {}), 'utf8').toString('base64');
}

/** 执行一个内置脚本，返回 { stdout, stderr }；超时/无输出时抛错 */
function runScript(name, arg, timeoutMs) {
  return new Promise((resolve, reject) => {
    let file;
    try { file = ensureScript(name); } catch (e) { reject(new Error(`脚本写入失败: ${e.message}`)); return; }
    execFile(
      POWERSHELL,
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file, '-ArgJson', encodeArg(arg)],
      { timeout: timeoutMs || 30000, maxBuffer: 32 * 1024 * 1024, windowsHide: true, encoding: 'utf8' },
      (err, stdout, stderr) => {
        if (err && !stdout) {
          const tail = stderr ? ` | ${core.oneLine(String(stderr), 300)}` : '';
          reject(new Error(`${name} 执行失败: ${err.message}${tail}`));
          return;
        }
        resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
      },
    );
  });
}

/** PowerShell ConvertTo-Json 的输出解析（空输出防御为空数组） */
function parsePsJson(text) {
  const t = String(text == null ? '' : text).trim();
  if (!t) return [];
  try {
    const v = JSON.parse(t);
    return v;
  } catch (_) {
    return null;
  }
}

function normalizeProcRow(r) {
  if (!r || typeof r !== 'object' || !Number.isInteger(r.pid) || r.pid <= 0) return null;
  return {
    pid: r.pid,
    ppid: Number.isInteger(r.ppid) ? r.ppid : 0,
    name: String(r.name || ''),
    cmd: r.cmd == null ? null : String(r.cmd),
    path: r.path == null ? null : String(r.path),
    started: r.started == null ? null : String(r.started),
    cpu: r.cpu == null ? null : Number(r.cpu),
    ws: r.ws == null ? 0 : Number(r.ws),
  };
}

/** 全量或按 pid 集合查进程（pids>200 时退化为全量，避免超长 WQL） */
async function listProcs(pids, timeoutMs) {
  const want = Array.isArray(pids) ? pids.filter((n) => Number.isInteger(n) && n > 0) : null;
  const arg = want && want.length > 0 && want.length <= 200 ? { pids: want } : {};
  const { stdout } = await runScript('procs.ps1', arg, timeoutMs || 30000);
  const parsed = parsePsJson(stdout);
  if (parsed === null) throw new Error('进程清单解析失败（非 JSON 输出）');
  const arr = Array.isArray(parsed) ? parsed : [parsed];
  return arr.map(normalizeProcRow).filter(Boolean);
}

/** Restart Manager 查文件/目录占用者 */
async function findLockers(targetPath, timeoutMs) {
  const { stdout } = await runScript('lockers.ps1', { path: targetPath }, timeoutMs || 30000);
  const parsed = parsePsJson(stdout);
  if (parsed === null) throw new Error('Restart Manager 输出解析失败');
  const obj = Array.isArray(parsed) ? parsed[0] : parsed;
  const lockers = core.parseLockers(obj && Array.isArray(obj.lockers) ? obj.lockers : obj && obj.lockers ? obj.lockers : stdout);
  return {
    path: targetPath,
    locked: !!(obj && obj.locked),
    lockers,
    error: obj && obj.error ? String(obj.error) : null,
  };
}

/** 强制结束单个进程 */
async function killPid(pid, timeoutMs) {
  const { stdout } = await runScript('kill.ps1', { pid }, timeoutMs || 15000);
  const parsed = parsePsJson(stdout);
  const obj = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!obj || typeof obj !== 'object') throw new Error('kill 结果解析失败');
  return { ok: obj.ok === true, error: obj.error ? String(obj.error) : null };
}

/** 树杀（taskkill /T /F）——经 execFile 直接调系统 taskkill */
function killTree(pid) {
  return new Promise((resolve) => {
    execFile(
      path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'),
      ['/PID', String(pid), '/T', '/F'],
      { timeout: 15000, windowsHide: true, encoding: 'utf8' },
      (err, stdout) => {
        if (err) {
          resolve({ ok: false, error: core.oneLine(String(stdout || err.message), 300) });
        } else {
          resolve({ ok: true, error: null });
        }
      },
    );
  });
}

function isWindows() {
  return process.platform === 'win32';
}

module.exports = { isWindows, listProcs, findLockers, killPid, killTree, runScript, encodeArg, parsePsJson };
