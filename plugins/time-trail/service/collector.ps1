# collector.ps1 —— 刻漏原生采集器（Windows PowerShell 5.1 兼容，零依赖）
#
# 职责（spec §5）：每 tick 读前台窗口（进程名+标题）与输入空闲时长，仅在
# （app 变 / 标题变（开标题时）/ 空闲态翻转 / 60s 心跳）时向 stdout 输出一行
# UTF-8 JSONL。stdout 是协议数据——任何非 JSONL 输出都算 bug。
#
# 生命周期：由 service/trail.js spawn（windowsHide）。父进程看门狗：每 tick
# Get-Process -Id ParentProcId，父进程死亡即自杀，不留孤儿采集器。
#
# 隐私（spec §2）：标题仅在 -CaptureTitle 时输出；ApplicationFrameHost（UWP
# 宿主）回退用标题前 24 字符作 app——这是 UWP 场景区分应用的唯一可行信号，
# 该行为不受 -CaptureTitle 影响（否则所有 UWP 应用会被并成一条）。

param(
  [int]$TickSec = 3,
  [int]$IdleSec = 180,
  [int]$ParentProcId = 0,
  [switch]$CaptureTitle
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class TrailNative {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [StructLayout(LayoutKind.Sequential)] public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
  [DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);
  public static uint IdleMs() {
    LASTINPUTINFO li = new LASTINPUTINFO();
    li.cbSize = (uint)Marshal.SizeOf(typeof(LASTINPUTINFO));
    if (!GetLastInputInfo(ref li)) return uint.MaxValue;
    return unchecked((uint)Environment.TickCount - li.dwTime);
  }
}
"@

$nameCache = @{ }
$sb = New-Object System.Text.StringBuilder 512
$idleThresholdMs = [int64]$IdleSec * 1000
$lastSig = ''
$lastEmit = [DateTime]::UtcNow
$heartbeatGap = [TimeSpan]::FromSeconds(60)

function Get-ProcName([int]$WinProcId) {
  $hit = $nameCache[$WinProcId]
  if ($null -ne $hit) { return $hit }
  $name = 'unknown'
  try {
    $p = Get-Process -Id $WinProcId -ErrorAction Stop
    if ($p -and $p.ProcessName) { $name = $p.ProcessName.ToLower() }
  } catch { $name = 'unknown' }
  if ($nameCache.Count -gt 800) { $nameCache.Clear() }
  $nameCache[$WinProcId] = $name
  return $name
}

function Send-Line([hashtable]$obj) {
  $json = $obj | ConvertTo-Json -Compress
  [Console]::Out.WriteLine($json)
  [Console]::Out.Flush()
}

while ($true) {
  # 父进程看门狗：服务已死就退出（防孤儿采集器）
  if ($ParentProcId -gt 0) {
    $parentAlive = $false
    try { $parentAlive = [bool](Get-Process -Id $ParentProcId -ErrorAction Stop) } catch { $parentAlive = $false }
    if (-not $parentAlive) { break }
  }

  $nowMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $idleMs = [TrailNative]::IdleMs()
  if ($idleMs -eq [uint32]::MaxValue) { $idleMs = 0 }  # API 失败按活跃处理，不误记 idle

  $fg = [TrailNative]::GetForegroundWindow()
  $app = $null
  $title = ''
  if ($fg -ne [IntPtr]::Zero) {
    $len = [TrailNative]::GetWindowText($fg, $sb, 512)
    if ($len -gt 0) { $title = $sb.ToString().Trim() }
    $winProcId = [uint32]0
    [void][TrailNative]::GetWindowThreadProcessId($fg, [ref]$winProcId)
    $procName = Get-ProcName ([int]$winProcId)
    if ($procName -eq 'applicationframehost' -and $title) {
      $app = $title.Substring(0, [Math]::Min(24, $title.Length)).ToLower()
    } else {
      $app = $procName
    }
  }

  $idle = [bool]($idleMs -ge $idleThresholdMs)
  $titleOut = ''
  if ($CaptureTitle) { $titleOut = $title }
  $titleSig = ''
  if ($CaptureTitle) { $titleSig = $title }
  $sig = '{0}|{1}|{2}' -f $app, $titleSig, $idle

  $heartbeatDue = ([DateTime]::UtcNow - $lastEmit) -ge $heartbeatGap
  if ($sig -ne $lastSig -or $heartbeatDue) {
    Send-Line @{ t = $nowMs; app = $app; title = $titleOut; idle = $idle; idleMs = [int64]$idleMs }
    $lastSig = $sig
    $lastEmit = [DateTime]::UtcNow
  }

  Start-Sleep -Milliseconds ([Math]::Max(200, ($TickSec * 1000) - 50))
}
