# 엔진 요청: 네이티브 창이 화면 배율(DPI)을 무시해 노트북에서 UI·글씨가 작게 보임 (2026-10-31)

HBGame(네이티브, a471833)은 시작할 때 `SetProcessDpiAwarenessContext`로 DPI 인식 모드가 되고, 창 안쪽 크기를
`game.hbpack.json`의 width·height(1280x720) **물리 픽셀**로 만든다(`AdjustWindowRectExForDpi`·`GetDpiForSystem` 사용).
화면 배율 125~150%인 노트북에서는 창이 그만큼 작아져 UI·글씨·캐릭터가 작게 보인다.
예전 WebView 실행기는 CSS 픽셀이라 배율만큼 커졌기 때문에, 같은 PC에서 "UI가 작아지고 글씨가 달라졌다"는 의견이 나왔다.

요청:
1. 창 크기를 width·height × (DPI / 96)으로 (화면보다 크면 화면에 맞게 줄임), 렌더 해상도는 창 크기 그대로
2. 또는 빌드 프로필에 창 모드 선택(배율 따름 / 전체 화면 / 최대화)과 Alt+Enter 전체 화면
3. 실행 중 DPI가 바뀌면(WM_DPICHANGED) 창 크기를 다시 맞춤
