# 엔진 요청: 네이티브 패키지의 C++ 작업 exe를 Windows 보안이 지움 (2026-10-31)

엔진 a471833 Windows 네이티브 패키지를 다른 PC(Windows 11 26200, ASUS 노트북 등)에서 실행하면 흰 창이 뜬 뒤 꺼진다.
그 PC의 `native-runtime.log`:

```
Error: spawn UNKNOWN  (tools/native-host.mjs:121 NativeHost.rpc)
Error: ENOENT: no such file or directory, realpath '...\Binaries\a0946a...e212.exe'  (native-game-platform.mjs:17 confined)
```

원인: 게임 C++를 담은 `Binaries/<hash>.exe`(MSYS2 g++ `-static -s`, 서명·버전 정보 없음)를 Windows 보안이 기계학습 판정
`Program:Win32/Contebrew.A!ml`으로 격리. 이 개발 PC에서도 `MpCmdRun -Scan -ScanType 3 -File <exe>`로 같은 판정이 재현됨
(개발 PC는 실행 중엔 막지 않아 몰랐음). 게임 코드와 무관하게 빌드마다 판정이 바뀜.

게임 쪽 임시 조치 (tools/package.mjs): 모든 exe에 버전 정보 리소스(tools/set_exe_info.ps1)와 아이콘을 넣고 sha256 갱신 → 로컬 검사는 깨끗.
다만 기계학습·클라우드 평판 판정이라 다른 PC에서 다시 걸릴 수 있음.

요청:
1. 작업 exe에 코드 서명(인증서) 또는 최소한 버전 정보·매니페스트를 빌드 단계에서 넣기
2. 실행 전에 작업 exe가 없거나 실행이 막히면(spawn UNKNOWN·ENOENT) "Windows 보안이 게임 파일을 격리했습니다" 같은 안내를 창에 표시
3. 가능하면 게임 C++를 별도 exe가 아니라 서명된 호스트가 읽는 형태로
