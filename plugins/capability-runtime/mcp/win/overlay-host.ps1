# Polaris capability-runtime 浮窗窗口控制器（常驻 PowerShell）
#
# 协议：stdin/stdout 各一行一个 UTF-8（无 BOM）JSON（自管字节流，规避 PS 5.1 的
#       GBK 代码页陷阱 —— 直接 ReadLine 会按系统代码页解 mojibake，故用 OpenStandardInput）。
#   parent → 控制器: { seq, op, ... }
#   控制器 → parent: { seq, ok, ... }
# op:
#   hello                                  → { ok: true, pid }
#   watch { rootPid, titlePrefix }         → { found, hwnd, pid } （轮询至 15s 超时）
#   place { hwnd, x,y,w,h (logical px), topmost } → { ok }  —— 控制器按 GetDpiForWindow 换算
#   check { hwnd, titlePrefix }            → { alive }
#   release { hwnd }                       → { ok }
#   exit                                   → 退出
#
# 安全注意：窗口寻找只认「spawn 出来的进程树 + 标题前缀」双重校验，绝不按进程名全局
# 搜索（避免绑架用户自己的 Edge/Chrome 窗口）。
$ErrorActionPreference = 'SilentlyContinue'

Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Runtime.InteropServices;

public static class CapWin {
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int X, int Y, int cx, int cy, uint uFlags);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
    [DllImport("user32.dll")] public static extern int GetWindowTextLengthW(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern int GetWindowTextW(IntPtr hWnd, [MarshalAs(UnmanagedType.LPWStr)] StringBuilder text, int count);
    [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr hWnd, uint flags);
    [DllImport("user32.dll")] public static extern int GetDpiForWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr ctx);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lParam);
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
}
"@

# Per-Monitor DPI Aware V2（失败静默降级 —— 老系统回 system aware）
try { [CapWin]::SetProcessDpiAwarenessContext([IntPtr](-4)) | Out-Null } catch { }

# ── UTF-8 无 BOM 双向 IO ─────────────────────────────────────────────────────
$stdin = [System.Console]::OpenStandardInput()
$stdout = [System.Console]::OpenStandardOutput()
$enc = New-Object System.Text.UTF8Encoding($false)
$inw = New-Object System.IO.StreamReader($stdin, $enc)

function Write-Line([string]$text) {
    $bytes = $enc.GetBytes($text + "`n")
    $stdout.Write($bytes, 0, $bytes.Length)
    $stdout.Flush()
}

# ── 窗口工具 ─────────────────────────────────────────────────────────────────
function Get-HwndPid([IntPtr]$h) {
    $p = [uint32]0
    [CapWin]::GetWindowThreadProcessId($h, [ref]$p) | Out-Null
    return [int]$p
}

function Get-HwndText([IntPtr]$h) {
    $len = [CapWin]::GetWindowTextLengthW($h)
    if ($len -le 0) { return '' }
    if ($len -gt 2048) { $len = 2048 }
    $sb = New-Object System.Text.StringBuilder ($len + 2)
    [CapWin]::GetWindowTextW($h, $sb, $sb.Capacity) | Out-Null
    return $sb.ToString()
}

function Is-TopLevel([IntPtr]$h) {
    $root = [CapWin]::GetAncestor($h, 2)   # GA_ROOT
    if ($root -ne $h) { return $false }
    return [CapWin]::IsWindowVisible($h)
}

function Get-ProcTree([int]$rootPid) {
    $set = New-Object System.Collections.Generic.HashSet[int]
    [void]$set.Add($rootPid)
    # 注意：Windows PowerShell 5.1 的 CIM WQL 解析器对 IN (...) 抛“无效查询”（0x80041017）；
    # 且逐 pid 查询（数十次 CIM 调用）在 watch 轮询下太慢。改为一次全量拉取 pid/ppid 表后纯内存遍历。
    $all = @()
    try { $all = @(Get-CimInstance -Query "SELECT ProcessId, ParentProcessId FROM Win32_Process" -ErrorAction SilentlyContinue) } catch { }
    if ($all.Count -eq 0) { return $set }
    $parentOf = @{}
    foreach ($c in $all) { $parentOf[[int]$c.ProcessId] = [int]$c.ParentProcessId }
    $frontier = New-Object System.Collections.Generic.List[int]
    [void]$frontier.Add($rootPid)
    for ($round = 0; $round -lt 12 -and $frontier.Count -gt 0; $round++) {
        $next = New-Object System.Collections.Generic.List[int]
        foreach ($p in $frontier) {
            foreach ($kv in $parentOf.GetEnumerator()) {
                if ($kv.Value -eq $p -and $set.Add($kv.Key)) { [void]$next.Add($kv.Key) }
            }
        }
        $frontier = $next
    }
    return $set
}

# ── watch：进程树 + 标题前缀找窗口（候选走 script: 作用域，回调跑在全局作用域） ──
$script:tree = $null
$script:prefix = $null
$script:hit = [IntPtr]::Zero
$script:cb = {
    param([IntPtr]$h, [IntPtr]$lp)
    try {
        if (-not [CapWin]::IsWindowVisible($h)) { return $true }
        $root = [CapWin]::GetAncestor($h, 2)
        if ($root -ne $h) { return $true }
        $p = Get-HwndPid $h
        if (-not ($script:tree -and $script:tree.Contains($p))) { return $true }
        $txt = Get-HwndText $h
        if ($script:prefix -and $txt.StartsWith($script:prefix)) {
            $script:hit = $h
            return $false
        }
    } catch { }
    return $true
}

function Watch-Window([int]$rootPid, [string]$titlePrefix, [int]$seq) {
    $deadline = [DateTime]::UtcNow.AddSeconds(15)
    while ([DateTime]::UtcNow -lt $deadline) {
        $set = Get-ProcTree $rootPid
        $script:tree = $set
        $script:prefix = $titlePrefix
        $script:hit = [IntPtr]::Zero
        try { [CapWin]::EnumWindows($script:cb, [IntPtr]::Zero) | Out-Null } catch { }
        if ($script:hit -ne [IntPtr]::Zero) {
            $own = Get-HwndPid $script:hit
            Write-Line ( @{ seq = $seq; found = $true; hwnd = $script:hit.ToInt64(); pid = $own } | ConvertTo-Json -Compress )
            return
        }
        Start-Sleep -Milliseconds 400
    }
    Write-Line ( @{ seq = $seq; found = $false } | ConvertTo-Json -Compress )
}

# ── place：logical px → physical px（GetDpiForWindow），再 SetWindowPos ────────
function Place-Window([long]$hInt, [double]$x, [double]$y, [double]$w, [double]$h, [bool]$topmost) {
    $hwnd = [IntPtr]$hInt
    if (-not [CapWin]::IsWindow($hwnd)) {
        Write-Line ( @{ seq = $script:opSeq; ok = $false; error = 'window gone' } | ConvertTo-Json -Compress )
        return
    }
    $dpi = [CapWin]::GetDpiForWindow($hwnd)
    if ($dpi -le 0) { $dpi = 96 }
    $scale = $dpi / 96.0
    $px = [int][Math]::Round($x * $scale)
    $py = [int][Math]::Round($y * $scale)
    $pw = [int][Math]::Round($w * $scale)
    $ph = [int][Math]::Round($h * $scale)
    $after = if ($topmost) { [IntPtr](-1) } else { [IntPtr](-2) }   # HWND_TOPMOST / NOTOPMOST
    $flags = 0x50                                                    # SWP_NOACTIVATE(0x10) | SWP_SHOWWINDOW(0x40)
    $ok = [CapWin]::SetWindowPos($hwnd, $after, $px, $py, $pw, $ph, $flags)
    Write-Line ( @{ seq = $script:opSeq; ok = [bool]$ok; dpi = $dpi } | ConvertTo-Json -Compress )
}

# ── 主循环 ───────────────────────────────────────────────────────────────────
while ($true) {
    $line = $inw.ReadLine()
    if ($null -eq $line) { break }
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    $msg = $null
    try { $msg = $line | ConvertFrom-Json } catch { continue }
    if ($null -eq $msg) { continue }
    $script:opSeq = [int]$msg.seq
    $op = [string]$msg.op
    switch ($op) {
        'hello'   { Write-Line ( @{ seq = $script:opSeq; ok = $true; pid = $PID } | ConvertTo-Json -Compress ) }
        'watch'   { Watch-Window ([int]$msg.rootPid) ([string]$msg.titlePrefix) $script:opSeq }
        'place'   { Place-Window ([long]$msg.hwnd) ([double]$msg.x) ([double]$msg.y) ([double]$msg.w) ([double]$msg.h) ([bool]$msg.topmost) }
        'check'   {
            $hwnd = [IntPtr][long]$msg.hwnd
            $alive = [CapWin]::IsWindow($hwnd)
            if ($alive) {
                $txt = Get-HwndText $hwnd
                $alive = $txt.StartsWith([string]$msg.titlePrefix)
            }
            Write-Line ( @{ seq = $script:opSeq; alive = [bool]$alive } | ConvertTo-Json -Compress )
        }
        'release' { Write-Line ( @{ seq = $script:opSeq; ok = $true } | ConvertTo-Json -Compress ) }
        'exit'    { return }
        default   { Write-Line ( @{ seq = $script:opSeq; ok = $false; error = 'unknown op' } | ConvertTo-Json -Compress ) }
    }
}
