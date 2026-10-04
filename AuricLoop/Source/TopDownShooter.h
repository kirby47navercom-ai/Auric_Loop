#pragma once
#include <HBEngine/Game.hpp>
#include <map>
HB_CLASS(Blueprintable)
class TopDownShooter : public hb::Actor {
public:
  HB_FUNCTION(BlueprintCallable, KoreanName="조준·발사·탄환 재사용", Category="탑다운 슈터")
  void Update(float delta,const std::vector<hb::Actor*>& bullets,const std::vector<hb::Actor*>& enemies);
private:
  float cooldown=0;
  hb::Vec3 facing{1,0,0};
  std::map<hb::Actor*,float> lifetime;
};
