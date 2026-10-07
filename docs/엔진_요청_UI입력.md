# 엔진 요청: 패키지 플레이어에서 UI 위젯이 입력을 막음

확인한 엔진: HBEngine 사용자용 `d03c655dc25a2bb6`, `prototype/ui-runtime.js`·`ui-runtime.css` (2026-10-07)

## 증상
Auric Loop 패키지(Game.exe)를 켜면 타이틀 화면에서 클릭해도, 키를 눌러도 시작되지 않는다.
DevTools로 넣은 입력은 통한다. 사람이 직접 누른 입력만 안 먹는다.

## 원인
1. `.hb-ui-element{pointer-events:auto}`라서 그림(Image)·글자(Text) 위젯도 클릭을 받는다. 거기에 `pointerdown`에서 `stopPropagation()`까지 하므로 화면 전체를 덮는 타이틀 그림을 누르면 클릭이 게임 canvas까지 가지 않는다.
2. 클릭하면 그 위젯 div가 포커스를 가져간다(`tabindex="-1"`이어도 클릭으로는 포커스됨). 모든 위젯이 `keydown`에서 `stopPropagation()`을 하므로, 그 뒤로는 player.js의 document `keydown`에 키가 오지 않는다. 즉 HUD 그림을 한 번 클릭하면 키보드가 죽는다.

## 바라는 동작
- Image·Text·Panel처럼 상호작용 없는 위젯은 기본으로 클릭이 통과하게 (`pointer-events:none`) 하거나, 위젯마다 "클릭 통과" 속성을 둔다.
- `keydown`의 `stopPropagation()`은 글자를 입력받는 TextInput만 하게 한다.

## 지금 게임 쪽 임시 조치
`tools/package.mjs`가 빌드 결과(`Builds/.../prototype`)의 두 파일만 위 동작대로 고쳐서 바탕화면에 복사한다. 엔진이 고쳐지면 그 패치는 지워도 된다. 엔진 코드가 바뀌어 패치할 줄을 못 찾으면 스크립트가 멈추고 알린다.
