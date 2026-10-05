# 사용자용 HBEngine 편집기로 프로젝트를 다시 열고, C++ 빌드 → 실행 → 창 스크린샷을 찍는다.
# 실행: powershell -ExecutionPolicy Bypass -File tools/preview.ps1 [-Out 경로.png] [-Seconds 2]
param([string]$Out = (Join-Path $env:TEMP "auric_preview.png"), [int]$Seconds = 2, [string[]]$Inputs = @(), [string]$Scene = "Garden")
$ErrorActionPreference = 'Stop'
$engine = 'C:\Users\kirby\HBEngine\Versions\d4de30b46c28bab7'
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
& $hb document.open '{"path":"Assets/Blueprints/BP_TopDownShooter.hbblueprint.json"}' | Out-Null
& $hb native.build '{"path":"Assets/Blueprints/BP_TopDownShooter.hbblueprint.json"}' | Out-Null
& $hb document.open ('{"path":"Assets/Scenes/' + $Scene + '.hbscene.json"}') | Out-Null
& $hb runtime.play '{}' | Out-Null
Start-Sleep $Seconds
foreach ($json in $Inputs) { & $hb runtime.input $json | Out-Null }  # 예: '{"key":"d","value":1}'
if ($Inputs) { Start-Sleep -Milliseconds 400 }

# 3. 편집기 창만 캡처
Add-Type -AssemblyName System.Drawing
if (-not ([System.Management.Automation.PSTypeName]'Win').Type) {
  Add-Type 'using System;using System.Runtime.InteropServices;public class Win{[DllImport("user32.dll")]public static extern bool GetWindowRect(IntPtr h,out RECT r);[DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);public struct RECT{public int L,T,R,B;}}'
}
$proc = Get-Process HBEngine | Where-Object { $_.Path -like "$engine*" -and $_.MainWindowHandle -ne 0 } | Select-Object -First 1
[Win]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null
Start-Sleep 1
$r = New-Object Win+RECT
[Win]::GetWindowRect($proc.MainWindowHandle, [ref]$r) | Out-Null
$bmp = New-Object System.Drawing.Bitmap ($r.R - $r.L), ($r.B - $r.T)
[System.Drawing.Graphics]::FromImage($bmp).CopyFromScreen($r.L, $r.T, 0, 0, $bmp.Size)
$bmp.Save($Out)
"port=$port screenshot=$Out"
