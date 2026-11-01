# 渲染 OCR 测试夹具图片（Windows + System.Drawing；产物已提交，重渲染可选）
# 用法：powershell -NoProfile -ExecutionPolicy Bypass -File render-images.ps1
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path

function New-TextImage($w, $h, $font, $size, $lines) {
  $bmp = New-Object System.Drawing.Bitmap($w, $h)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::White)
  $f = New-Object System.Drawing.Font($font, $size)
  $b = [System.Drawing.Brushes]::Black
  $y = 24
  foreach ($line in $lines) { $g.DrawString($line, $f, $b, 30, $y); $y += [int]($size * 2.1) }
  $g.Dispose()
  return $bmp
}

# 1. 中英混排 PNG（OCR 主夹具）
$bmp = New-TextImage 900 360 'Microsoft YaHei' 30 @('检验报告单', '患者姓名：张三  年龄：45岁', 'Invoice No: A-2026-1102', 'Total Amount: 1,234.56 CNY')
$bmp.Save("$dir\fixture-zh.png", [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

# 2. 中文 JPEG（扫描 PDF 的 DCTDecode 夹具）
$bmp = New-TextImage 1000 400 'SimSun' 26 @('住院费用清单', '床号 12  科室 骨科  日期 2026-10-30', '合计金额 8765.43 元')
$bmp.Save("$dir\fixture-page.jpg", [System.Drawing.Imaging.ImageFormat]::Jpeg)
$bmp.Dispose()

# 3. 横放文本（旋转校正夹具：把正常文本逆时针转 90°，配 /Rotate 90 页面）
$bmp = New-TextImage 900 300 'Arial' 34 @('ROTATED PAGE CHECK 90', 'rotation fixture 7741')
$bmp.RotateFlip([System.Drawing.RotateFlipType]::Rotate270FlipNone)
$bmp.Save("$dir\fixture-rot.jpg", [System.Drawing.Imaging.ImageFormat]::Jpeg)
$bmp.Dispose()

# 4. 灰度 PNG + 原始 RGB 字节（FlateDecode RGB / 1bpp 夹具的原料）
$bmp = New-TextImage 800 260 'SimSun' 28 @('黑白传真扫描 TEST', 'FAX LINE 6620')
$bmp.Save("$dir\fixture-gray.png", [System.Drawing.Imaging.ImageFormat]::Png)
$raw = New-Object System.Drawing.Bitmap(800, 260)
$g2 = [System.Drawing.Graphics]::FromImage($raw)
$g2.Clear([System.Drawing.Color]::White)
$f2 = New-Object System.Drawing.Font('SimSun', 28)
$b2 = [System.Drawing.Brushes]::Black
$g2.DrawString([char]0x9ED1 + [char]0x767D + [char]0x4F20 + [char]0x771F + [char]0x626B + [char]0x63CF + ' TEST', $f2, $b2, 30, 40)
$g2.DrawString('FAX LINE 6620', $f2, $b2, 30, 120)
$g2.Dispose()
$ms = New-Object System.IO.MemoryStream
for ($y = 0; $y -lt 260; $y++) { for ($x = 0; $x -lt 800; $x++) {
  $c = $raw.GetPixel($x, $y)
  [void]$ms.WriteByte($c.R); [void]$ms.WriteByte($c.G); [void]$ms.WriteByte($c.B)
} }
[System.IO.File]::WriteAllBytes("$dir\fixture-gray.raw", $ms.ToArray())
$raw.Dispose()

Write-Host 'fixtures rendered'
