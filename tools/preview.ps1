# 사용자용 HBEngine 편집기로 프로젝트를 다시 열고, C++ 빌드 → 실행 → 창 스크린샷을 찍는다.
# 실행: powershell -ExecutionPolicy Bypass -File tools/preview.ps1 [-Out 경로.png] [-Seconds 2]
param([string]$Out = (Join-Path $env:TEMP "auric_preview.png"), [int]$Seconds = 2, [string]$Inputs = "", [string]$Scene = "Hub")
$ErrorActionPreference = 'Stop'
$engine = 'C:\Users\kirby\HBEngine\Versions\d03c655dc25a2bb6'
$root = Split-Path $PSScriptRoot
$project = Join-Path $root 'AuricLoop\AuricLoop.hbproject'
$node = Join-Path $engine 'runtime\node.exe'

# 1. 열린 편집기를 닫고(저장 안 된 문서 사본이 디스크를 덮지 않게) C++·문서 사본 동기화
Get-Process HBEngine -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "$engine*" } | ForEach-Object { $_.CloseMainWindow() | Out-Null }
Start-Sleep 4
Get-Process HBEngine -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "$engine*" } | Stop-Process -Force
& $node (Join-Path $root 'tools\sync_cpp.mjs')

# 2. 편집기 실행 후 서버 포트 찾기
Start-Process -FilePath (Join-Path $engine 'HBEngine.exe') -ArgumentList "`"$project`"" -WorkingDirectory $engine
$port = $null
for ($i = 0; $i -lt 40 -and -not $port; $i++) {
  Start-Sleep 1
  $port = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalAddress -eq '127.0.0.1' } |
    Where-Object { (Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).Path -like "$engine*" } | Select-Object -First 1 -ExpandProperty LocalPort
}
if (-not $port) { throw '편집기 서버를 찾지 못했어요.' }
Start-Sleep 6
# PowerShell 5는 외부 프로그램 인수의 따옴표를 지우므로 JSON은 파일(@경로)로 넘긴다
$hb = { param($m, $p) $f = [IO.Path]::GetTempFileName(); [IO.File]::WriteAllText($f, $p); & $node (Join-Path $engine 'tools\hb.mjs') --url "http://127.0.0.1:$port" $m "@$f"; Remove-Item $f }
& $hb viewport.configure '{"presentation":{"gameView":true}}' | Out-Null
# C++ 빌드는 실행(runtime.play)이 Source에서 다시 컴파일함. native.build는 BP 문서를 열어야만 돼서(문서가 수정됨 표시) 쓰지 않음
& $hb document.open ('{"path":"Assets/Scenes/' + $Scene + '.hbscene.json"}') | Out-Null
& $hb runtime.play '{}' | Out-Null
Start-Sleep $Seconds
# 입력 여러 개는 | 로 구분: -Inputs '{"key":"q","value":1}|{"key":"q","value":0}'
foreach ($json in ($Inputs -split '\|' | Where-Object { $_ })) { & $hb runtime.input $json | Out-Null; Start-Sleep -Milliseconds 100 }
if ($Inputs) { Start-Sleep -Milliseconds 400 }

# 3. 편집기 창만 캡처. PrintWindow(PW_RENDERFULLCONTENT)라 다른 창이 위에 있어도 되고 포커스를 뺏지 않는다.
Add-Type -AssemblyName System.Drawing
if (-not ([System.Management.Automation.PSTypeName]'Win2').Type) {
  Add-Type 'using System;using System.Runtime.InteropServices;public class Win2{[DllImport("user32.dll")]public static extern bool GetWindowRect(IntPtr h,out RECT r);[DllImport("user32.dll")]public static extern bool PrintWindow(IntPtr h,IntPtr dc,uint f);public struct RECT{public int L,T,R,B;}}'
}
$proc = Get-Process HBEngine | Where-Object { $_.Path -like "$engine*" -and $_.MainWindowHandle -ne 0 } | Select-Object -First 1
$r = New-Object Win2+RECT
[Win2]::GetWindowRect($proc.MainWindowHandle, [ref]$r) | Out-Null
$bmp = New-Object System.Drawing.Bitmap ($r.R - $r.L), ($r.B - $r.T)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$dc = $g.GetHdc(); [Win2]::PrintWindow($proc.MainWindowHandle, $dc, 2) | Out-Null; $g.ReleaseHdc($dc)
$bmp.Save($Out)
"port=$port screenshot=$Out"
