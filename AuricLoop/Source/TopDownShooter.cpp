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
constexpr float respawnDelay=3.0f;
constexpr float bossHp=40.0f;          // 기획서 5장 [제안]
constexpr float bossSpeed=3.6f;
constexpr float bossRadius=1.4f;       // 몸이 커서 검 사거리와 접촉 판정에 더한다
constexpr float bossChargeWindup=1.0f; // 돌진 전 예고 1초
constexpr float bossChargeTime=0.6f;
constexpr float bossChargeSpeed=14.0f;
constexpr int bossRing=12;             // 원형 탄막 12방향 x 2회
constexpr int bossSummon=2;            // 근거리 해골 2마리 소환
constexpr float bossRest=1.5f;
constexpr float enterDepth=2.0f;       // 문을 지나 이만큼 들어오면 방에 들어온 것으로 봄 (m)
}

// <rooms> tools/gen_scene.py가 만든 표. 손으로 고치지 말고 생성기를 고친다.
struct Spawn{float x,y;int ranged;};
struct Room{float cy,half;int kind,first,count;};  // kind: 0 전투, 1 채집, 2 상점, 3 보스
constexpr Spawn spawns[]={{-6.0f,4.0f,0},{0.0f,6.0f,0},{6.0f,4.0f,0},{-7.0f,3.0f,0},{7.0f,3.0f,0},{-5.0f,8.0f,1},{5.0f,8.0f,1}};
constexpr Room rooms[]={{0.0f,12.0f,0,0,3},{25.0f,12.0f,0,3,4},{46.0f,8.0f,1,7,0},{67.0f,12.0f,2,7,0},{96.0f,16.0f,3,7,0}};
constexpr int roomCount=5;
// </rooms>

static int RoomAt(float y){for(int i=0;i<roomCount;++i)if(y<=rooms[i].cy+rooms[i].half+0.5f)return i;return roomCount-1;}

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
  hb::UI::SetText(player,"HUD","Title",Hp<=0?(Fatigue>=FatigueMax?"지쳐 쓰러졌다":"쓰러졌다")
    :HasReturnItem?"[귀환] 획득":bossActor&&hb::ActorPool::IsActive(bossActor)?"해골 대장":"탐색");
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

void TopDownShooter::Animate(hb::Actor* player,float delta,bool moving){
  // 프레임: 공격 3장(0.1초씩) > 걷기 4장(초당 8장) > 서 있기. 그림은 오른쪽을 보고 있어 왼쪽이면 뒤집는다.
  std::string next;
  if(attackAnim>0){attackAnim-=delta;const int f=attackAnim>0.2f?0:attackAnim>0.1f?1:2;next="Attack_"+std::to_string(f);}
  else if(moving){walkTime+=delta;next="Walk_"+std::to_string(int(walkTime*8)%4);}
  else{walkTime=0;next="Idle_0";}
  if(next!=currentSprite){currentSprite=next;hb::Sprites::SetSprite(player,"Assets/Sprites/Valen/S_Valen_"+next+".hbsprite.json");}
  if(slashFx&&slashTime>0&&(slashTime-=delta)<=0)hb::ActorPool::Release(slashFx);
}

void TopDownShooter::SetDoors(const std::vector<hb::Actor*>& doors,int room,bool locked){
  // doors[i]는 방 i와 방 i+1 사이 문. 풀에서 꺼내 있으면 잠김(막힘), 반환하면 열림.
  for(int i:{room-1,room}){if(i<0||i>=(int)doors.size())continue;auto* d=doors[i];
    if(locked&&!hb::ActorPool::IsActive(d)){hb::Transform t;t.position=hb::Scene::GetPosition(d);hb::ActorPool::Acquire(std::vector<hb::Actor*>{d},t);}
    else if(!locked&&hb::ActorPool::IsActive(d))hb::ActorPool::Release(d);}
}

void TopDownShooter::EnterRoom(int index,const std::vector<hb::Actor*>& enemies,const std::vector<hb::Actor*>& doors,const std::vector<hb::Actor*>& boss){
  RoomIndex=index;auto& state=roomState[index];if(state)return;
  const Room& r=rooms[index];
  if(r.kind==3&&!boss.empty()){  // 보스방: 해골 대장 등장
    state=1;fightingRoom=index;SetDoors(doors,index,true);
    hb::Transform t;t.position=hb::Vec3{0,r.cy+6,0.1f};bossActor=hb::ActorPool::Acquire(boss,t);
    BossHp=balance::bossHp;bossPattern=0;bossStep=0;bossTimer=2.0f;Hud(hb::Gameplay::GetPlayerPawn());return;
  }
  if(r.count==0){state=2;return;}  // 채집방·상점은 싸움 없음
  state=1;fightingRoom=index;SetDoors(doors,index,true);
  const std::vector<hb::Actor*> melee(enemies.begin(),enemies.begin()+balance::rangedFrom),ranged(enemies.begin()+balance::rangedFrom,enemies.end());
  for(int i=r.first;i<r.first+r.count;++i){
    hb::Transform t;t.position=hb::Vec3{spawns[i].x,r.cy+spawns[i].y,0.1f};
    if(auto* e=hb::ActorPool::Acquire(spawns[i].ranged?ranged:melee,t)){enemyHp[e]=balance::enemyHp;stun[e]=0;}
  }
}

bool TopDownShooter::UpdateBoss(hb::Actor* player,float delta,const std::vector<hb::Actor*>& bullets,const std::vector<hb::Actor*>& enemies){
  // 해골 대장: 천천히 다가오다가 돌진 → 원형 탄막 → 졸개 소환을 차례로 반복 (기획서 5장)
  if(!bossActor||!hb::ActorPool::IsActive(bossActor))return false;
  const auto at=hb::Scene::GetPosition(bossActor),to=hb::Scene::GetPosition(player)-at;
  const float len=Length(to);const auto dir=len>.01f?to*(1/len):hb::Vec3{0,-1,0};
  bossTimer-=delta;
  if(bossStep==0){  // 쉬면서 추격
    hb::Physics::SetVelocity(bossActor,dir*balance::bossSpeed);
    if(bossTimer<=0){bossStep=1;bossTimer=bossPattern==0?balance::bossChargeWindup:0.5f;
      if(bossPattern==0)hb::Sprites::SetColor(bossActor,hb::Color{1,0.45f,0.45f,1});}  // 돌진 예고: 붉게
  }else if(bossPattern==0){  // 돌진
    if(bossStep==1){hb::Physics::SetVelocity(bossActor,hb::Vec3{0,0,0});bossDash=dir;
      if(bossTimer<=0){bossStep=2;bossTimer=balance::bossChargeTime;hb::Sprites::SetColor(bossActor,hb::Color{1,1,1,1});}}
    else{hb::Physics::SetVelocity(bossActor,bossDash*balance::bossChargeSpeed);if(bossTimer<=0)bossStep=3;}
  }else if(bossPattern==1){  // 원형 탄막 2회
    hb::Physics::SetVelocity(bossActor,hb::Vec3{0,0,0});
    if(bossTimer<=0&&bossStep<=2){
      for(int i=0;i<balance::bossRing;++i){const auto d=Rotate(hb::Vec3{1,0,0},360.f*i/balance::bossRing+bossStep*15.f);
        hb::Transform t;t.position=at+d*1.6f;if(auto* b=hb::ActorPool::Acquire(bullets,t)){hb::Physics::SetVelocity(b,d*balance::shotSpeed);lifetime[b]=balance::shotLife;Shots++;}}
      bossStep++;bossTimer=0.5f;
    }
  }else{  // 졸개 소환
    const std::vector<hb::Actor*> melee(enemies.begin(),enemies.begin()+balance::rangedFrom);
    for(int i=0;i<balance::bossSummon;++i){hb::Transform t;t.position=at+hb::Vec3{i?2.5f:-2.5f,-1.5f,0};
      if(auto* e=hb::ActorPool::Acquire(melee,t)){enemyHp[e]=balance::enemyHp;stun[e]=0.5f;}}
    bossStep=3;
  }
  if(bossStep==3){bossStep=0;bossPattern=(bossPattern+1)%3;bossTimer=balance::bossRest;}
  if(len<balance::bossRadius+balance::contactRange)Damage(player,1);
  return true;
}

void TopDownShooter::Update(float delta,const std::vector<hb::Actor*>& bullets,const std::vector<hb::Actor*>& enemies,const std::vector<hb::Actor*>& effects,const std::vector<hb::Actor*>& doors,const std::vector<hb::Actor*>& boss){
  auto* player=hb::Gameplay::GetPlayerPawn();if(!player)return;
  frame++;if(hudDirty)Hud(player);
  if(!started){started=true;Hp=balance::playerHp;
    for(size_t i=0;i<enemies.size();++i){enemyHp[enemies[i]]=balance::enemyHp;shotTimer[enemies[i]]=1+0.3f*i;}
    Hud(player);}
  const auto position=hb::Scene::GetPosition(player);
  const Room& room=rooms[RoomIndex];

  // 방 입장: 문을 지나 조금 들어오면 그 방의 적이 나오고 문이 잠긴다
  {const int at=RoomAt(position.y);const Room& r=rooms[at];
   if(position.y>r.cy-r.half+balance::enterDepth||at==0)EnterRoom(at,enemies,doors,boss);}

  // 탄환 수명과 방 밖으로 나간 탄환 정리
  for(auto it=lifetime.begin();it!=lifetime.end();){
    const auto p=hb::Scene::GetPosition(it->first);it->second-=delta;
    if(it->second<=0||std::fabs(p.x)>room.half||std::fabs(p.y-room.cy)>room.half){hb::ActorPool::Release(it->first);it=lifetime.erase(it);}else ++it;
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
  Animate(player,delta,hb::VectorMath::VectorLengthSquared(move)>.01f);

  attackCooldown-=delta;dodgeCooldown-=delta;invulnerable-=delta;

  // 회피: Space를 누른 순간 바라보는 방향으로 대시, 대시 중 무적
  const bool dodgeDown=hb::Input::IsKeyDown("space")||hb::Input::IsKeyDown(" ");
  if(dodgeDown&&!dodgeHeld&&dodgeCooldown<=0&&dodgeTime<=0){dodgeTime=balance::dodgeTime;dodgeCooldown=balance::dodgeCooldown;}
  dodgeHeld=dodgeDown;
  if(dodgeTime>0){dodgeTime-=delta;hb::Physics::SetVelocity(player,facing*balance::dodgeSpeed);}

  // 검 부채꼴 베기: 적에게 피해, 범위 안의 적 탄환은 지움 (기획: 투사체 삭제)
  if(hb::Input::IsKeyDown("LeftMouseButton")&&attackCooldown<=0){
    attackCooldown=balance::swordInterval;Swings++;attackAnim=0.3f;
    if(!effects.empty()){  // 베기 이펙트를 바라보는 방향 앞에 0.12초
      hb::Transform t;t.position=position+facing*1.4f;t.position.z=0.2f;
      t.rotation=hb::Vec3{0,0,std::atan2(facing.y,facing.x)*180/3.14159265f};
      if(slashFx)hb::ActorPool::Release(slashFx);
      slashFx=hb::ActorPool::Acquire(effects,t);slashTime=0.12f;
    }
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
    if(bossActor&&hb::ActorPool::IsActive(bossActor)){
      const auto d=hb::Scene::GetPosition(bossActor)-position;const float len=Length(d);
      if(len<=balance::swordRange+balance::bossRadius&&(len<=balance::bossRadius+balance::contactRange||hb::VectorMath::DotProduct(d*(1/len),facing)>=minDot)){
        BossHp-=balance::swordDamage;Hits++;
        if(BossHp<=0){hb::ActorPool::Release(bossActor);Kills++;HasReturnItem=true;Hud(player);}
      }
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

  if(UpdateBoss(player,delta,bullets,enemies))alive++;
  // 방 클리어: 문이 열리고 피로도 +1 (기획), 피로도가 가득 차면 쓰러짐
  if(alive==0&&fightingRoom>=0){
    roomState[fightingRoom]=2;SetDoors(doors,fightingRoom,false);fightingRoom=-1;
    RoomClears++;Fatigue++;if(Fatigue>=FatigueMax){Hp=0;gameOver=balance::respawnDelay;}Hud(player);
  }
}
