#pragma once
#include <HBEngine/Game.hpp>
#include <map>
#include <string>
HB_CLASS(Blueprintable)
class TopDownShooter : public hb::Actor {
public:
  HB_FUNCTION(BlueprintCallable, KoreanName="조준·발사·탄환 재사용", Category="탑다운 슈터")
  void Update(float delta,const std::vector<hb::Actor*>& bullets,const std::vector<hb::Actor*>& enemies,const std::vector<hb::Actor*>& effects);
  // 피로도 한계. 기획 100, 데모 기본 20 (docs/데모_기획서.md 4-1). 편집기 BP 기본값에서 바꿀 수 있음.
  HB_PROPERTY(BlueprintReadWrite)
  int FatigueMax = 20;
  HB_PROPERTY(BlueprintReadWrite)
  int Fatigue = 0;
  HB_PROPERTY(BlueprintReadWrite)
  int Hp = 0;
  HB_PROPERTY(BlueprintReadWrite)
  int Kills = 0;
  HB_PROPERTY(BlueprintReadWrite)
  int RoomClears = 0;
  HB_PROPERTY(BlueprintReadWrite)
  int Swings = 0;
  HB_PROPERTY(BlueprintReadWrite)
  int Hits = 0;
  HB_PROPERTY(BlueprintReadWrite)
  int Shots = 0;
private:
  void Hud(hb::Actor* player);
  void Fire(const std::vector<hb::Actor*>& bullets,const hb::Vec3& from,const hb::Vec3& dir);
  void Damage(hb::Actor* player,int amount);
  void Animate(hb::Actor* player,float delta,bool moving);
  float attackCooldown=0,dodgeTime=0,dodgeCooldown=0,invulnerable=0,gameOver=0,waveTimer=0;
  bool dodgeHeld=false,started=false,hudDirty=true;
  float attackAnim=0,walkTime=0,slashTime=0;
  std::string currentSprite;
  hb::Actor* slashFx=nullptr;
  int frame=0,fatigueLevel=0;  // fatigueLevel: 지금 보이는 피로도 그림(10% 단위)
  hb::Vec3 facing{1,0,0};
  std::map<hb::Actor*,float> enemyHp,stun,shotTimer,lifetime;
  std::map<hb::Actor*,hb::Vec3> spawn;
};
