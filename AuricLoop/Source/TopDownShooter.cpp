#include "TopDownShooter.h"
#include <cmath>
#include <string>

// 수치는 docs/데모_기획서.md 4-1, 4-2, 5장 기준.
// ponytail: 상수로 둠. 편집기에서 바꿔야 하면 HB_PROPERTY로 옮김.
namespace balance {
constexpr int playerHp=3;              // 기획: 체력 3
constexpr float invulnerableTime=1.0f; // 피격 후 무적 [제안]
constexpr float dodgeTime=1.0f;        // 기획: 1초 대시
constexpr float dodgeSpeed=12.0f;      // 기획: 이동속도 6의 2배
constexpr float dodgeCooldown=2.0f;    // 기획: 쿨타임 2초
constexpr float swordDamage=1.0f;      // 무기공격력 1 x 공격력 1
constexpr float swordInterval=0.35f;
constexpr float swordRange=2.5f;
constexpr float swordHalfAngle=50.0f;  // 부채꼴 100도
constexpr float swordStun=0.1f;        // 기획: 0.1초 경직
constexpr float enemyHp=3.5f;          // 검 4대
constexpr float enemySpeed=4.8f;       // 기획: 플레이어보다 20% 느림
constexpr float contactRange=0.75f;
constexpr int rangedFrom=4;            // 적 풀 4번째부터 원거리 해골 [제안: 방 구성]
constexpr float rangedKeep=6.0f;       // 원거리 해골이 유지하는 거리
constexpr float shotInterval=2.0f;     // 2초마다
constexpr int shotCount=3;             // 3갈래
constexpr float shotSpread=15.0f;      // 갈래 사이 각도
constexpr float shotSpeed=7.0f;
constexpr float shotLife=3.0f;
constexpr float shotHitRange=0.45f;
constexpr float roomHalf=12.0f;        // 중형 방 24m
constexpr float respawnDelay=3.0f;
constexpr float waveDelay=3.0f;        // ponytail: 문·다음 방이 생기기 전까지 같은 방에 다시 등장
}

static float Length(const hb::Vec3& v){return std::sqrt(hb::VectorMath::VectorLengthSquared(v));}
static hb::Vec3 Rotate(const hb::Vec3& v,float degrees){const float r=degrees*3.14159265f/180,c=std::cos(r),s=std::sin(r);return {v.x*c-v.y*s,v.x*s+v.y*c,0};}

void TopDownShooter::Hud(hb::Actor* player){
  // UIWidget 인스턴스는 첫 프레임 뒤에 생기므로 그 전에는 표시만 미룬다
  if(frame<2){hudDirty=true;return;}
  hudDirty=false;
  // 요소 이름은 tools/gen_hud.py가 만든 W_TopDown과 같다
  const int hp=Hp<0?0:Hp;
  for(int i=1;i<=balance::playerHp;++i)hb::UI::SetVisible(player,"HUD","HpFill"+std::to_string(i),hp==i);
  hb::UI::SetText(player,"HUD","HpText",std::to_string(hp)+" / "+std::to_string(balance::playerHp));
  int level=FatigueMax>0?Fatigue*10/FatigueMax:10;if(level>10)level=10;  // 10% 단위 그림
  if(level!=fatigueLevel){
    auto name=[](int lv){std::string n=std::to_string(lv*10);return "Fatigue"+std::string(3-n.size(),'0')+n;};
    if(fatigueLevel>=0)hb::UI::SetVisible(player,"HUD",name(fatigueLevel),false);
    hb::UI::SetVisible(player,"HUD",name(level),true);fatigueLevel=level;
  }
  hb::UI::SetText(player,"HUD","Title",Hp>0?"탐색":Fatigue>=FatigueMax?"지쳐 쓰러졌다":"쓰러졌다");
}

void TopDownShooter::Damage(hb::Actor* player,int amount){
  if(invulnerable>0||dodgeTime>0)return;
  Hp-=amount;invulnerable=balance::invulnerableTime;if(Hp<=0)gameOver=balance::respawnDelay;Hud(player);
}

void TopDownShooter::Fire(const std::vector<hb::Actor*>& bullets,const hb::Vec3& from,const hb::Vec3& dir){
  for(int i=0;i<balance::shotCount;++i){
    const auto d=Rotate(dir,(i-(balance::shotCount-1)/2.0f)*balance::shotSpread);
    hb::Transform t;t.position=from+d*0.6f;
    if(auto* b=hb::ActorPool::Acquire(bullets,t)){hb::Physics::SetVelocity(b,d*balance::shotSpeed);lifetime[b]=balance::shotLife;Shots++;}
  }
}

void TopDownShooter::Update(float delta,const std::vector<hb::Actor*>& bullets,const std::vector<hb::Actor*>& enemies){
  auto* player=hb::Gameplay::GetPlayerPawn();if(!player)return;
  frame++;if(hudDirty)Hud(player);
  if(!started){started=true;Hp=balance::playerHp;
    for(size_t i=0;i<enemies.size();++i){auto* e=enemies[i];enemyHp[e]=balance::enemyHp;shotTimer[e]=1+0.3f*i;
      if(hb::ActorPool::IsActive(e))spawn[e]=hb::Scene::GetPosition(e);}
    Hud(player);}
  const auto position=hb::Scene::GetPosition(player);

  // 탄환 수명과 방 밖으로 나간 탄환 정리
  for(auto it=lifetime.begin();it!=lifetime.end();){
    const auto p=hb::Scene::GetPosition(it->first);it->second-=delta;
    if(it->second<=0||std::fabs(p.x)>balance::roomHalf||std::fabs(p.y)>balance::roomHalf){hb::ActorPool::Release(it->first);it=lifetime.erase(it);}else ++it;
  }

  if(Hp<=0){ // ponytail: 정산 화면이 생기면 거기로 보냄. 지금은 3초 뒤 회복
    hb::Physics::SetVelocity(player,hb::Vec3{0,0,0});gameOver-=delta;
    for(auto* e:enemies)if(hb::ActorPool::IsActive(e))hb::Physics::SetVelocity(e,hb::Vec3{0,0,0});
    for(auto& [b,life]:lifetime)hb::Physics::SetVelocity(b,hb::Vec3{0,0,0});
    if(gameOver<=0){Hp=balance::playerHp;Fatigue=0;invulnerable=balance::invulnerableTime*2;Hud(player);}
    return;
  }

  // 조준: 마우스가 있으면 마우스 방향, 없으면 이동 방향
  hb::Vec3 move{hb::Input::GetAxis("d")-hb::Input::GetAxis("a"),hb::Input::GetAxis("w")-hb::Input::GetAxis("s"),0};
  if(hb::VectorMath::VectorLengthSquared(move)>.01f)facing=hb::VectorMath::NormalizeVector(move);
  hb::Vec3 aim;if(hb::Input::GetMouseWorldPosition(hb::Vec3{0,0,1},position,aim)){
    const auto d=aim-position;if(hb::VectorMath::VectorLengthSquared(d)>.01f)facing=hb::VectorMath::NormalizeVector(d);
  }
  hb::Sprites::SetFlip(player,facing.x<0,false);

  attackCooldown-=delta;dodgeCooldown-=delta;invulnerable-=delta;

  // 회피: Space를 누른 순간 바라보는 방향으로 대시, 대시 중 무적
  const bool dodgeDown=hb::Input::IsKeyDown("space")||hb::Input::IsKeyDown(" ");
  if(dodgeDown&&!dodgeHeld&&dodgeCooldown<=0&&dodgeTime<=0){dodgeTime=balance::dodgeTime;dodgeCooldown=balance::dodgeCooldown;}
  dodgeHeld=dodgeDown;
  if(dodgeTime>0){dodgeTime-=delta;hb::Physics::SetVelocity(player,facing*balance::dodgeSpeed);}

  // 검 부채꼴 베기: 적에게 피해, 범위 안의 적 탄환은 지움 (기획: 투사체 삭제)
  if(hb::Input::IsKeyDown("LeftMouseButton")&&attackCooldown<=0){
    attackCooldown=balance::swordInterval;Swings++;
    const float minDot=std::cos(balance::swordHalfAngle*3.14159265f/180);
    auto inFan=[&](const hb::Vec3& at){const auto d=at-position;const float len=Length(d);
      return len<=balance::swordRange&&(len<=balance::contactRange||hb::VectorMath::DotProduct(d*(1/len),facing)>=minDot);};  // 바로 붙은 적은 방향과 관계없이 맞음
    for(auto* e:enemies){if(!hb::ActorPool::IsActive(e))continue;
      const auto at=hb::Scene::GetPosition(e);if(!inFan(at))continue;
      const auto d=at-position;const float len=Length(d);
      enemyHp[e]-=balance::swordDamage;Hits++;stun[e]=balance::swordStun;
      hb::Physics::SetVelocity(e,(len>.01f?d*(1/len):facing)*6);
      if(enemyHp[e]<=0){hb::ActorPool::Release(e);Kills++;}
    }
    for(auto it=lifetime.begin();it!=lifetime.end();)
      if(inFan(hb::Scene::GetPosition(it->first))){hb::ActorPool::Release(it->first);it=lifetime.erase(it);}else ++it;
  }

  // 해골: 근거리는 추격, 원거리는 거리를 두고 3갈래 탄 발사
  int alive=0;
  for(size_t i=0;i<enemies.size();++i){auto* e=enemies[i];if(!hb::ActorPool::IsActive(e))continue;alive++;
    if(stun[e]>0){stun[e]-=delta;continue;}
    const auto d=position-hb::Scene::GetPosition(e);const float len=Length(d);
    const auto dir=len>.01f?d*(1/len):hb::Vec3{0,0,0};
    if((int)i<balance::rangedFrom){
      hb::Physics::SetVelocity(e,dir*balance::enemySpeed);
      if(len<balance::contactRange)Damage(player,1);
    }else{
      const float side=len>balance::rangedKeep+1?1.f:len<balance::rangedKeep-1?-1.f:0.f;
      hb::Physics::SetVelocity(e,dir*(balance::enemySpeed*side));
      if((shotTimer[e]-=delta)<=0){shotTimer[e]=balance::shotInterval;Fire(bullets,hb::Scene::GetPosition(e),dir);}
    }
  }
  for(auto& [b,life]:lifetime)if(Length(hb::Scene::GetPosition(b)-position)<balance::shotHitRange){Damage(player,1);life=0;}

  // 방 클리어: 피로도 +1 (기획), 피로도가 가득 차면 쓰러짐
  if(alive==0){
    if(waveTimer<=0){waveTimer=balance::waveDelay;RoomClears++;Fatigue++;if(Fatigue>=FatigueMax){Hp=0;gameOver=balance::respawnDelay;}Hud(player);}
    else if((waveTimer-=delta)<=0)
      for(auto& [e,at]:spawn){hb::Transform t;t.position=at;enemyHp[e]=balance::enemyHp;hb::ActorPool::Acquire(std::vector<hb::Actor*>{e},t);}
  }
}
