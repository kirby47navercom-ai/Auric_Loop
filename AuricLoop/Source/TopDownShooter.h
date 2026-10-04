#pragma once
#include <HBEngine/Game.hpp>
#include <map>
HB_CLASS(Blueprintable)
class TopDownShooter : public hb::Actor {
public:
  HB_FUNCTION(BlueprintCallable, KoreanName="조준·발사·탄환 재사용", Category="탑다운 슈터")
  void Update(float delta,const std::vector<hb::Actor*>& bullets,const std::vector<hb::Actor*>& enemies);
  HB_PROPERTY(BlueprintReadWrite)
  int Hp = 0;
  HB_PROPERTY(BlueprintReadWrite)
  int Kills = 0;
  HB_PROPERTY(BlueprintReadWrite)
  int Swings = 0;
  HB_PROPERTY(BlueprintReadWrite)
  int Hits = 0;
private:
  void Hud(hb::Actor* player);
  float attackCooldown=0,dodgeTime=0,dodgeCooldown=0,invulnerable=0,gameOver=0;
  bool dodgeHeld=false,started=false,hudDirty=true;
  int frame=0;
  hb::Vec3 facing{1,0,0};
  std::map<hb::Actor*,float> enemyHp,stun;
};
