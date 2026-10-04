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
constexpr float respawnDelay=3.0f;
}

static float Length(const hb::Vec3& v){return std::sqrt(hb::VectorMath::VectorLengthSquared(v));}

void TopDownShooter::Hud(hb::Actor* player){
  hb::UI::SetText(player,"HUD","Title",Hp>0?"HP "+std::to_string(Hp)+" / "+std::to_string(balance::playerHp)+"    탐색 1F":"쓰러졌다... 잠시 후 다시 일어난다");
}

void TopDownShooter::Update(float delta,const std::vector<hb::Actor*>& bullets,const std::vector<hb::Actor*>& enemies){
  auto* player=hb::Gameplay::GetPlayerPawn();if(!player)return;
  if(!started){started=true;Hp=balance::playerHp;for(auto* e:enemies)enemyHp[e]=balance::enemyHp;Hud(player);}
  const auto position=hb::Scene::GetPosition(player);

  if(Hp<=0){ // ponytail: 정산 화면이 생기면 거기로 보냄. 지금은 3초 뒤 체력만 회복
    hb::Physics::SetVelocity(player,hb::Vec3{0,0,0});gameOver-=delta;
    for(auto* e:enemies)if(hb::ActorPool::IsActive(e))hb::Physics::SetVelocity(e,hb::Vec3{0,0,0});
    if(gameOver<=0){Hp=balance::playerHp;invulnerable=balance::invulnerableTime*2;Hud(player);}
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

  // 검 부채꼴 베기
  if(hb::Input::IsKeyDown("LeftMouseButton")&&attackCooldown<=0){
    attackCooldown=balance::swordInterval;Swings++;
    const float minDot=std::cos(balance::swordHalfAngle*3.14159265f/180);
    for(auto* e:enemies){if(!hb::ActorPool::IsActive(e))continue;
      const auto d=hb::Scene::GetPosition(e)-position;const float len=Length(d);
      if(len>balance::swordRange||(len>.01f&&hb::VectorMath::DotProduct(d*(1/len),facing)<minDot))continue;
      enemyHp[e]-=balance::swordDamage;Hits++;stun[e]=balance::swordStun;
      hb::Physics::SetVelocity(e,(len>.01f?d*(1/len):facing)*6);
      if(enemyHp[e]<=0){hb::ActorPool::Release(e);Kills++;}
    }
  }

  // 해골: 플레이어를 쫓아오고 닿으면 피해 1
  for(auto* e:enemies){if(!hb::ActorPool::IsActive(e))continue;
    if(stun[e]>0){stun[e]-=delta;continue;}
    const auto d=position-hb::Scene::GetPosition(e);const float len=Length(d);
    hb::Physics::SetVelocity(e,len>.01f?d*(balance::enemySpeed/len):hb::Vec3{0,0,0});
    if(len<balance::contactRange&&invulnerable<=0&&dodgeTime<=0){
      Hp-=1;invulnerable=balance::invulnerableTime;if(Hp<=0)gameOver=balance::respawnDelay;Hud(player);
    }
  }
}
