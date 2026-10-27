# 参数化原生文件对话框注入（运行时枚举 hwnd，每次不同）
# 由 douyin-publish 插件生成并执行；无硬编码 hwnd
Add-Type @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public class PickDlg {
    public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
    public delegate bool EnumChildProc(IntPtr hwnd, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr hwndParent, EnumChildProc cb, IntPtr lParam);
    [DllImport("user32.dll")] public static extern int GetClassName(IntPtr hWnd, StringBuilder sb, int max);
    [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder sb, int max);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr SendMessageW(IntPtr hWnd, uint Msg, IntPtr wParam, string lParam);
    public static IntPtr dlg = IntPtr.Zero;
    static bool EnumCb(IntPtr h, IntPtr l) {
        var c = new StringBuilder(256); GetClassName(h, c, 256);
        if (IsWindowVisible(h) && c.ToString() == "#32770") { dlg = h; return false; }
        return true;
    }
    public static IntPtr FindDialog() {
        dlg = IntPtr.Zero;
        EnumWindows(EnumCb, IntPtr.Zero);
        return dlg;
    }
    public static string Describe(IntPtr parent) {
        var res = new List<string>();
        EnumChildWindows(parent, (h, l) => {
            var c = new StringBuilder(256); GetClassName(h, c, 256);
            var t = new StringBuilder(512); GetWindowText(h, t, 512);
            res.Add("hwnd=" + h + " class=" + c.ToString() + " text=[" + t.ToString() + "]");
            return true;
        }, IntPtr.Zero);
        return string.Join("
", res.ToArray());
    }
}
"@
$dlg = [PickDlg]::FindDialog()
if ($dlg -eq [IntPtr]::Zero) { Write-Output "ERR_NO_DIALOG"; exit 1 }
Start-Sleep -Milliseconds 300
# 找文件名 Edit（类 Edit 且可见）与「打开」按钮
$edit = [IntPtr]::Zero
$openBtn = [IntPtr]::Zero
[PickDlg]::Describe($dlg).Split("`n") | ForEach-Object {
    if ($_ -match "hwnd=(\d+) class=Edit ") {
        if ($edit -eq [IntPtr]::Zero) { $edit = [IntPtr][long]$Matches[1] }
    }
    if ($_ -match "hwnd=(\d+) class=Button .*打开") {
        if ($openBtn -eq [IntPtr]::Zero) { $openBtn = [IntPtr][long]$Matches[1] }
    }
}
if ($edit -eq [IntPtr]::Zero) { Write-Output "ERR_NO_EDIT"; exit 1 }
# WM_SETTEXT = 0x000C
[PickDlg]::SendMessageW($edit, 0x000C, [IntPtr]::Zero, 'D:\space\base\Polaris-plugin\plugins\animation-2d\out\sunset_beach.mp4') | Out-Null
Write-Output "SET_TEXT_DONE"
if ($openBtn -ne [IntPtr]::Zero) {
    # BM_CLICK = 0x00F5
    [PickDlg]::SendMessage($openBtn, 0x00F5, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
    Write-Output "CLICK_DONE"
} else {
    # 无打开按钮：对 Edit 发送 Enter 兜底（WM_KEYDOWN 0x0100）
    [PickDlg]::SendMessage($edit, 0x0100, [IntPtr][int]13, [IntPtr]::Zero) | Out-Null
    Write-Output "NO_OPEN_BUTTON_SENT_ENTER"
}