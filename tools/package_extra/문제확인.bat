@echo off
chcp 65001 >nul
rem 게임이 안 켜질 때 더블클릭: 원인이 될 만한 것을 모아 문제확인.txt로 열어 준다 (tools/package.mjs가 패키지에 넣음)
cd /d "%~dp0"
set OUT=%~dp0문제확인.txt
(
echo [폴더] %~dp0
echo [Windows]
ver
echo [게임 파일]
if exist "HBGame_*.exe" (echo 게임 실행 파일 있음) else (echo 게임 실행 파일 없음 - zip을 먼저 풀었는지 확인)
if exist "runtime\HBScript_*.exe" (echo 스크립트 실행 파일 있음) else (echo 스크립트 실행 파일 없음 - 백신이 지웠거나 zip 안에서 바로 실행함)
if exist "game.hbpack.json" (echo 게임 데이터 있음) else (echo 게임 데이터 없음 - zip 안에서 바로 실행함)
echo [스크립트 시작 시험]
for %%f in (runtime\HBScript_*.exe) do "%%f" -e "console.log('스크립트 정상 '+process.version)" 2>&1
echo 종료 코드 %errorlevel%
echo [오류로그.txt]
if exist "오류로그.txt" type "오류로그.txt"
echo [엔진 기록 native-runtime.log]
for /d %%d in ("%LOCALAPPDATA%\HBEngine\Games\*") do if exist "%%d\native-runtime.log" powershell -NoProfile -Command "Get-Content -LiteralPath '%%d\native-runtime.log' -Tail 40 -Encoding UTF8"
) > "%OUT%" 2>&1
start "" notepad "%OUT%"
