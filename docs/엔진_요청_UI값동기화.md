# 엔진 요청: 위젯 값 하나 바꿀 때마다 위젯 전체를 복사함

## 증상
타이틀에서 위젯 노드 30~70개를 매 프레임 움직이자 개발 빌드가 초당 3~10장으로 떨어졌다 (프레임마다 시뮬레이션 340ms).
같은 장면에서 게임 HUD만 쓸 때는 초당 90장.

## 원인 (prototype/ui-runtime.js, native-transport.js)
`hb::UI::SetOpacity`·`SetPosition`·`SetScale`·`Animate` 등 값 하나를 바꿀 때마다 `sync()`가
`immutableNativeSnapshot({...owner.gameplayDebug.ui, [instance]: 모든 노드})`를 부른다.
그 안에서 owner의 **모든 위젯 인스턴스**(우리는 W_TopDown 200 + W_Front 87~141 노드)를 `structuredClone` → `freeze` → `JSON.stringify` → `JSON.parse`.
한 번에 약 7ms라서 호출 수에 비례해 프레임이 늘어난다. CPU 프로파일 3초 중 `immutableNativeSnapshot` 1.4초, `operation`·`sync` 0.6초.
`uiAnimate`도 진행 중인 애니메이션마다 매 프레임 `sync`를 불러 같다.

## 바라는 것
- 한 프레임의 UI 명령을 모두 적용한 뒤 **프레임당 한 번만** 스냅숏 (또는 바뀐 노드만).
- 바뀐 인스턴스만 다시 복사 (다른 인스턴스는 이전 스냅숏 재사용).

## 게임 쪽 우회 (지금)
계속 움직이는 층은 스스로 움직이는 WebP로 굽고(tools/make_title_fx.py), C++는 정해진 순간에만 값을 바꾼다.
Ui 도우미는 위치 1px·투명도 1/40·배율 1/100로 반올림해 같은 값이면 보내지 않는다 (TopDownShooter.h).
