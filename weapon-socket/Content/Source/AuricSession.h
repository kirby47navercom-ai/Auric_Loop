#pragma once
#include <HBEngine/Game.hpp>

// 실행 하나 동안 하나만 사는 게임 인스턴스. 장면을 넘어도 남는 진행(state["run"])을 들고 있다.
// 진행 내용은 TopDownShooter::SaveRun/LoadRun이 쓴다. 부스 리셋(F12)은 hb::Game::Reset()으로 새로 만든다.
HB_CLASS(Blueprintable)
class AuricSession : public hb::GameInstance {
public:
  HB_PROPERTY(BlueprintReadWrite)
  int Starts = 0;
  void Init() override;
};
