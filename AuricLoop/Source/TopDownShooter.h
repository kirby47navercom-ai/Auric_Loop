#pragma once
#include <HBEngine/Game.hpp>
#include <map>
#include <string>
HB_CLASS(Blueprintable)
class TopDownShooter : public hb::Actor {
public:
  HB_FUNCTION(BlueprintCallable, KoreanName="조준·발사·탄환 재사용", Category="탑다운 슈터")
  void Update(float delta,const std::vector<hb::Actor*>& bullets,const std::vector<hb::Actor*>& enemies,const std::vector<hb::Actor*>& effects,const std::vector<hb::Actor*>& doors,const std::vector<hb::Actor*>& boss);
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
  HB_PROPERTY(BlueprintReadWrite)
  int RoomIndex = 0;
  HB_PROPERTY(BlueprintReadWrite)
  float BossHp = 0;
  HB_PROPERTY(BlueprintReadWrite)
  bool HasReturnItem = false;  // 기획: 보스를 잡으면 [귀환] 아이템
  HB_PROPERTY(BlueprintReadWrite)
  bool Returning = false;      // 귀환 페이즈
  HB_PROPERTY(BlueprintReadWrite)
  bool ReturnSuccess = false;
  HB_PROPERTY(BlueprintReadWrite)
  int DoorHits = 0;
  HB_PROPERTY(BlueprintReadWrite)
  int Flashbangs = 3;          // ponytail: 골드가 생기면 기획대로 골드 10씩 소모
private:
  void Hud(hb::Actor* player);
  void Fire(const std::vector<hb::Actor*>& bullets,const hb::Vec3& from,const hb::Vec3& dir);
  void Damage(hb::Actor* player,int amount);
  void Animate(hb::Actor* player,float delta,bool moving);
  void EnterRoom(int index,const std::vector<hb::Actor*>& enemies,const std::vector<hb::Actor*>& doors,const std::vector<hb::Actor*>& boss);
  void UpdateReturn(hb::Actor* player,const hb::Vec3& position,const std::vector<hb::Actor*>& enemies,const std::vector<hb::Actor*>& doors);
  void StunAll(const std::vector<hb::Actor*>& enemies,float seconds);
  bool UpdateBoss(hb::Actor* player,float delta,const std::vector<hb::Actor*>& bullets,const std::vector<hb::Actor*>& enemies);
  void SetDoors(const std::vector<hb::Actor*>& doors,int room,bool locked);
  float attackCooldown=0,dodgeTime=0,dodgeCooldown=0,invulnerable=0,gameOver=0;
  bool dodgeHeld=false,started=false,hudDirty=true;
  float attackAnim=0,walkTime=0,slashTime=0;
  std::string currentSprite;
  hb::Actor* slashFx=nullptr;
  int frame=0,fatigueLevel=0;  // fatigueLevel: 지금 보이는 피로도 그림(10% 단위)
  hb::Vec3 facing{1,0,0};
  std::map<hb::Actor*,float> enemyHp,stun,shotTimer,lifetime;
  std::map<int,int> roomState;  // 0 처음, 1 전투 중(문 잠김), 2 클리어
  int fightingRoom=-1,returnRoom=-1;
  bool returnHeld=false,flashHeld=false;
  hb::Actor* bossActor=nullptr;
  int bossPattern=0,bossStep=0;
  float bossTimer=0;
  hb::Vec3 bossDash{0,0,0};
};
