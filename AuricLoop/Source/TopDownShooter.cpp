#include "TopDownShooter.h"
#include <cmath>
#include <string>
#include <algorithm>

// 수치 근거: docs/데모_기획서.md 4·5·6장. 값은 BP 기본값(편집기 속성)에서 고친다.

TopDownShooter* TopDownShooter::Current=nullptr;
static AuricRules fallbackRules;  // 장면에 BP_AuricRules가 없을 때

static const char* koreanNames[]={"발렌","셰리","알레아"};
static const char* faces[]={"valen","sherry","alea"};
static const char* weapons[]={"검","활","지팡이"};
static float Length(const hb::Vec3& v){return std::sqrt(hb::VectorMath::VectorLengthSquared(v));}
static hb::Vec3 Normal(const hb::Vec3& v,const hb::Vec3& fallback){const float l=Length(v);return l>.01f?v*(1/l):fallback;}
static hb::Vec3 Rotate(const hb::Vec3& v,float degrees){const float r=degrees*3.14159265f/180,c=std::cos(r),s=std::sin(r);return {v.x*c-v.y*s,v.x*s+v.y*c,0};}
static float Angle(const hb::Vec3& d){return std::atan2(d.y,d.x)*180/3.14159265f;}

// =====================================================================================
// 적: 행동은 상태 머신(Assets/AI/FSM_*.hbstatemachine.json)이 고르고, 상태마다 아래 함수 하나가 불린다.
// 상태 머신 파라미터: Distance(플레이어까지 거리), Stunned(경직), Ready(원거리 장전 끝), Next(보스 다음 패턴)
// =====================================================================================

void Enemy::Awake(){
  // 풀에서 다시 꺼낼 때도 불린다. 생성한 쪽이 먼저 정한 무적·경직(귀환 해골)은 지우지 않는다
  Hp=MaxHp;flash=0;burnLeft=0;ring=0;pattern=0;shotTimer=ShotInterval*0.5f;mode=Mode::Halt;burnedOut=false;
  sentStunned=sentReady=sentNear=flipped=false;sentVelocity={9e9f,0,0};
  hb::Sprites::SetColor(this,hb::Color{1,1,1,1});
  hb::States::Start(this,Brain);
}

hb::Vec3 Enemy::ToPlayer(float& distance) const{
  auto* game=TopDownShooter::Current;if(!game){distance=999;return {0,-1,0};}
  const auto d=game->PlayerPosition()-hb::Scene::GetPosition(const_cast<Enemy*>(this));distance=Length(d);return Normal(d,{0,-1,0});
}

void Enemy::Tick(float delta){
  // 매 프레임: 경직·화상·깜빡임·접촉 피해, 상태 머신 파라미터, 지금 상태(mode)에 맞는 이동
  auto* game=TopDownShooter::Current;
  float distance;const auto dir=ToPlayer(distance);
  if(stun>0)stun-=delta;
  if(flash>0&&(flash-=delta)<=0)hb::Sprites::SetColor(this,hb::Color{1,1,1,1});
  if(burnLeft>0){burnLeft-=delta;if(!Invulnerable){Hp-=burnDamage*delta;burnedOut=Hp<=0.001f;}}
  // 상태 머신 파라미터·뒤집기는 바뀔 때만 보낸다 (적 수 × 매 프레임 명령을 줄임)
  const bool ready=KeepDistance>0&&(shotTimer-=delta)<=0,stunned=stun>0,flip=dir.x<0,near=distance<Radius+1.2f;
  if(ready!=sentReady){sentReady=ready;hb::States::SetBool(this,"Ready",ready);}
  if(near!=sentNear){sentNear=near;hb::States::SetBool(this,"Near",near);}  // 근거리 해골의 휘두르기 그림
  if(stunned!=sentStunned){sentStunned=stunned;hb::States::SetBool(this,"Stunned",stunned);}
  if(flip!=flipped){flipped=flip;hb::Sprites::SetFlip(this,flip,false);}
  const bool frozen=!game||game->Frozen();
  if(!frozen&&stun<=0&&distance<Radius+0.35f)game->DamagePlayer(ContactDamage);
  if(mode==Mode::Dash||mode==Mode::Stagger)return;  // 돌진 속도·밀려남은 그대로 둔다
  hb::Vec3 v{0,0,0};
  if(!frozen&&stun<=0){
    if(mode==Mode::Chase)v=dir*Speed;
    else if(mode==Mode::Range){const float side=distance>KeepDistance+1?1.f:distance<KeepDistance-1?-1.f:0.f;v=dir*(Speed*side);}
  }
  if(Length(v-sentVelocity)>0.05f||++velocityAge>=10){sentVelocity=v;velocityAge=0;hb::Physics::SetVelocity(this,v);}  // 벽에 막혀 줄어든 속도도 가끔 다시 맞춘다
}

void Enemy::Halt(){mode=Mode::Halt;sentVelocity={0,0,0};hb::Physics::SetVelocity(this,hb::Vec3{0,0,0});}
void Enemy::Chase(){mode=Mode::Chase;hb::Sprites::SetColor(this,hb::Color{1,1,1,1});}
void Enemy::Range(){mode=Mode::Range;}
void Enemy::Stagger(){mode=Mode::Stagger;}

void Enemy::Windup(){
  // 공격 예고: 멈추고 붉게. 보스는 돌진 방향을 이때 정한다
  Halt();float distance;dashDir=ToPlayer(distance);
  hb::Sprites::SetColor(this,hb::Color{1,0.45f,0.45f,1});flash=0;
  if(Boss)if(auto* game=TopDownShooter::Current)game->Sfx("BossCharge");
}

void Enemy::Fire(){
  Halt();hb::Sprites::SetColor(this,hb::Color{1,1,1,1});
  auto* game=TopDownShooter::Current;if(!game||game->Frozen())return;
  float distance;const auto dir=ToPlayer(distance);
  game->FireBullets(hb::Scene::GetPosition(this),dir,ShotCount,ShotSpread,ShotSpeed);
  shotTimer=ShotInterval;
}

void Enemy::Dash(){
  mode=Mode::Dash;hb::Sprites::SetColor(this,hb::Color{1,1,1,1});
  sentVelocity=dashDir*DashSpeed;hb::Physics::SetVelocity(this,sentVelocity);
  pattern=1;hb::States::SetFloat(this,"Next",float(pattern));
}

void Enemy::Ring(){
  // 원형 탄막: 두 번째는 15도 돌려서 틈을 바꾼다
  Halt();auto* game=TopDownShooter::Current;
  if(game&&!game->Frozen())for(int i=0;i<RingCount;++i){
    const auto d=Rotate(hb::Vec3{1,0,0},360.f*i/RingCount+ring*15.f);
    game->FireBullets(hb::Scene::GetPosition(this)+d*1.6f,d,1,0,ShotSpeed);}
  if(++ring%2==0){pattern=2;hb::States::SetFloat(this,"Next",float(pattern));}
}

void Enemy::Summon(){
  Halt();const auto at=hb::Scene::GetPosition(this);
  for(int i=0;i<SummonCount;++i){hb::Transform t;t.position=at+hb::Vec3{i%2?2.5f:-2.5f,-1.5f-i/2,0};
    if(auto* e=dynamic_cast<Enemy*>(hb::Scene::Spawn(SummonBlueprint,t)))e->Stun(0.5f);}
  pattern=0;hb::States::SetFloat(this,"Next",float(pattern));
}

void Enemy::Stun(float seconds){stun=std::max(stun,seconds);sentVelocity={0,0,0};hb::Physics::SetVelocity(this,hb::Vec3{0,0,0});}

bool Enemy::TakeHit(float damage,const hb::Vec3& push,float stunSeconds,float burnSeconds){
  if(!Invulnerable){Hp-=damage;if(burnSeconds>0){burnLeft=burnSeconds;}}
  // 맞은 순간 붉게 (하얀 번쩍은 경직 상태의 맞는 그림 클립 첫 프레임), 보스가 아니면 밀려나며 잠깐 경직
  auto* game=TopDownShooter::Current;flash=game?game->HitFlashTime():0.1f;hb::Sprites::SetColor(this,hb::Color{1,0.5f,0.5f,1});
  if(!Boss){stun=std::max(stun,stunSeconds);sentVelocity=push;hb::Physics::SetVelocity(this,sentVelocity);}
  return Hp<=0.001f;  // 소수 오차로 0에 못 닿는 경우
}

// =====================================================================================
// 게임 규칙
// =====================================================================================

std::vector<Enemy*> TopDownShooter::Enemies() const{
  std::vector<Enemy*> list;
  for(auto* a:hb::Scene::GetAllActorsOfClass("Enemy"))if(auto* e=dynamic_cast<Enemy*>(a))list.push_back(e);
  return list;
}

hb::Actor* TopDownShooter::Door(const char* tag) const{auto list=hb::Scene::GetActorsWithTag(tag,true);return list.empty()?nullptr:list.front();}

void TopDownShooter::SetDoor(const char* tag,bool locked){
  // 문은 장면에 놓인 철창. 풀에서 꺼내 있으면 잠김(막힘), 반환하면 열림
  auto* d=Door(tag);if(!d)return;
  if(locked&&!hb::ActorPool::IsActive(d)){hb::Transform t;t.position=hb::Scene::GetPosition(d);hb::ActorPool::Acquire(std::vector<hb::Actor*>{d},t);}
  else if(!locked&&hb::ActorPool::IsActive(d))hb::ActorPool::Release(d);
}

float TopDownShooter::WeaponDamage() const{
  const float base=Character==1?rules->ArrowDamage:Character==2?rules->BoltDamage:rules->SwordDamage;
  return base*(1+rules->UpgradeBonus*WeaponLevel)*(Enchant==1?1+rules->EnchantPower:1);
}

void TopDownShooter::DamagePlayer(int amount){
  if(invulnerable>0||dodgeTimer>0||Hp<=0)return;
  Hp-=amount;invulnerable=rules->InvulnerableTime;Sfx("Hurt");if(Hp<=0)gameOver=rules->RespawnDelay;Hud();
}

void TopDownShooter::FireBullets(const hb::Vec3& from,const hb::Vec3& dir,int count,float spread,float speed){
  for(int i=0;i<count;++i){
    const auto d=Rotate(dir,(i-(count-1)/2.0f)*spread);
    hb::Transform t;t.position=from+d*0.6f;t.position.z=0.15f;
    if(auto* b=Take(bulletPool,rules->EnemyShotPrefab,t)){hb::Physics::SetVelocity(b,d*speed);bullets[b]=rules->EnemyShotLife;Shots++;}
  }
}

void TopDownShooter::DropCoin(const hb::Vec3& at,int value){
  hb::Transform t;t.position=hb::Vec3{at.x,at.y,0.05f};
  if(auto* c=Take(coinPool,rules->CoinPrefab,t))coins[c]=value;else Gold+=value;
}

void TopDownShooter::StunAll(float seconds){for(auto* e:Enemies())e->Stun(seconds);}

// 탄·골드·베기 이펙트는 장면에 미리 놓아 두고(태그 Pool.*) 화면 밖에 세워 둔다. 꺼내기·돌려놓기는 옮기기만 한다.
// 실행 중 생성(Scene::Spawn)과 엔진 풀(ActorPool)은 부를 때마다 컴포넌트를 다시 시작해 수 ms~수십 ms가 걸려 프레임이 끊긴다
static const hb::Vec3 parked{0,-200,0};

hb::Actor* TopDownShooter::Take(std::vector<hb::Actor*>& pool,const std::string& prefab,const hb::Transform& at){
  if(!pool.empty()){auto* a=pool.back();pool.pop_back();hb::Scene::SetTransform(a,at);return a;}
  return hb::Scene::Spawn(prefab,at);  // 모자랄 때만 새로 생성 (끊김 감수)
}

void TopDownShooter::Give(std::vector<hb::Actor*>& pool,hb::Actor* actor){
  if(&pool==&bulletPool||&pool==&shotPool)hb::Physics::SetVelocity(actor,hb::Vec3{0,0,0});  // 골드·이펙트는 물리 몸체가 없다
  hb::Scene::SetPosition(actor,parked);pool.push_back(actor);
}

void TopDownShooter::PlayFx(const std::string& sprite,int frames,float step,const hb::Vec3& at,float angle,bool flip,float hold){
  hb::Transform t;t.position=at;t.rotation=hb::Vec3{0,0,angle};
  auto* a=Take(fxPool,rules->FxPrefab,t);if(!a)return;
  hb::Sprites::SetSprite(a,sprite+"0.hbsprite.json");hb::Sprites::SetFlip(a,flip,false);
  fxs.push_back(Fx{a,sprite,frames,0,0,step,hold});
}

void TopDownShooter::UpdateFx(float delta){
  for(auto it=fxs.begin();it!=fxs.end();){
    it->time+=delta;const int f=int(it->time/it->step);
    if(f>=it->frames&&it->time>=it->frames*it->step+it->hold){Give(fxPool,it->actor);it=fxs.erase(it);continue;}
    if(f<it->frames&&f!=it->shown){it->shown=f;hb::Sprites::SetSprite(it->actor,it->sprite+std::to_string(f)+".hbsprite.json");}
    ++it;}
}

void TopDownShooter::Prewarm(){
  bulletPool=hb::Scene::GetActorsWithTag("Pool.EnemyShot");
  shotPool=hb::Scene::GetActorsWithTag("Pool.PlayerShot");
  coinPool=hb::Scene::GetActorsWithTag("Pool.Coin");
  fxPool=hb::Scene::GetActorsWithTag("Pool.Fx");
}

void TopDownShooter::KillEnemy(Enemy* e){
  const auto at=hb::Scene::GetPosition(e);Kills++;Sfx("Kill");
  DropCoin(at,e->GoldMin+Kills%std::max(1,e->GoldMax-e->GoldMin+1));
  if(e->Boss){HasReturnItem=true;Monster++;boss=nullptr;BossHp=0;Hud();}
  if(monsterDrop&&fightingRoom>=0&&Enemies().size()<=1)Monster++;  // 이 방 마지막 해골은 마물 소재 확정
  PlayFx(e->DeathSprite,4,0.1f,at,0,e->Flipped(),0.5f);  // 쓰러지는 그림은 이펙트로 (적 오브젝트는 바로 지움)
  hb::Scene::Destroy(e);
}

bool TopDownShooter::HitEnemy(Enemy* e,const hb::Vec3& push,float damage){
  Hits++;Sfx("Hit");
  // 타격감: 맞은 자리에 불꽃, 화면 살짝 흔들림, 밀려남
  const auto at=hb::Scene::GetPosition(e);
  PlayFx(rules->HitSprite,4,0.035f,hb::Vec3{at.x-push.x*0.3f,at.y-push.y*0.3f+0.2f,0.3f},float(std::rand()%360),false);
  shake=rules->ShakeTime;
  const bool dead=e->TakeHit(Returning?0:damage,push*rules->Knockback,rules->HitStun,Enchant==2?rules->BurnTime:0);
  if(Enchant==2)e->burnDamage=WeaponDamage()*rules->BurnRate;
  if(e->Boss)BossHp=e->Hp;
  if(dead)KillEnemy(e);
  return dead;
}

void TopDownShooter::Slash(const hb::Vec3& position,const std::vector<Enemy*>& enemies){
  // 검 부채꼴 베기: 적에게 피해, 범위 안의 적 탄은 지움 (기획: 투사체 삭제)
  attackCooldown=rules->SwordInterval;Swings++;attackAnim=0.3f;Sfx("Slash");
  PlayFx(rules->SlashSprite,4,0.05f,position+facing*1.1f+hb::Vec3{0,0.2f,0.2f},Angle(facing),false);  // 캐릭터 그림과 따로, 공격 방향으로 돌린 베기
  const float minDot=std::cos(rules->SwordHalfAngle*3.14159265f/180),reach=rules->SwordRange+(Enchant==3?rules->SlashExtend:0);
  auto inFan=[&](const hb::Vec3& at,float radius){const auto d=at-position;const float len=Length(d);
    return len<=reach+radius&&(len<=radius+0.75f||hb::VectorMath::DotProduct(d*(1/len),facing)>=minDot);};  // 바로 붙은 적은 방향과 관계없이 맞음
  for(auto* e:enemies){const auto at=hb::Scene::GetPosition(e);if(!inFan(at,e->Boss?e->Radius:0))continue;
    HitEnemy(e,Normal(at-position,facing),WeaponDamage());}
  if(Returning)if(auto* d=Door("Door.Bottom"))if(hb::ActorPool::IsActive(d)&&Length(hb::Scene::GetPosition(d)-position)<rules->DoorReach){
    Sfx("DoorHit");if(++DoorHits>=rules->DoorHitsToOpen){SetDoor("Door.Bottom",false);StunAll(rules->DoorStun);Sfx("DoorOpen");}Hud();}
  for(auto it=bullets.begin();it!=bullets.end();)
    if(inFan(hb::Scene::GetPosition(it->first),0)){Give(bulletPool,it->first);it=bullets.erase(it);}else ++it;
}

void TopDownShooter::Shoot(const hb::Vec3& from){
  hb::Transform t;t.position=from+facing*0.8f;t.position.z=0.2f;t.rotation=hb::Vec3{0,0,Angle(facing)};
  auto* s=Take(shotPool,rules->PlayerShotPrefab,t);if(!s)return;
  hb::Sprites::SetSprite(s,Character==1?rules->ArrowSprite:rules->BoltSprite);Sfx(Character==1?"Arrow":"Bolt");
  hb::Physics::SetVelocity(s,facing*(Character==1?rules->ArrowSpeed:rules->BoltSpeed));
  shots[s]=rules->PlayerShotLife;shotBoom[s]=false;Swings++;
}

void TopDownShooter::UpdateShots(float delta,const std::vector<Enemy*>& enemies){
  std::vector<hb::Actor*> done;
  for(auto& [s,life]:shots){life-=delta;
    if(shotBoom[s]){if(life<=0)done.push_back(s);continue;}  // 폭발 그림을 잠깐 보여 주고 반환
    const auto p=hb::Scene::GetPosition(s);const auto dir=Normal(hb::Physics::GetVelocity(s),facing);
    bool wall=std::fabs(p.x)>halfWidth-0.2f||std::fabs(p.y)>halfHeight-0.2f,hit=false;  // 벽·문·보스에 막힘
    if(Returning)if(auto* d=Door("Door.Bottom"))if(hb::ActorPool::IsActive(d)&&Length(hb::Scene::GetPosition(d)-p)<1.5f){
      DoorHits+=Character==1?rules->ArrowDoorHits:1;wall=true;Sfx("DoorHit");
      if(DoorHits>=rules->DoorHitsToOpen){SetDoor("Door.Bottom",false);StunAll(rules->DoorStun);Sfx("DoorOpen");}Hud();}
    for(auto* e:enemies){if(wall||(hit&&Enchant!=3))break;
      if(Length(hb::Scene::GetPosition(e)-p)<rules->PlayerShotHit+(e->Boss?e->Radius:0)){HitEnemy(e,dir,WeaponDamage());hit=true;if(e->Boss)wall=true;}}
    if(!wall&&!(hit&&Enchant!=3)&&life>0)continue;  // 각인 관통(3)이면 적을 뚫고 벽·문·보스에서 멈춤
    if(Character!=2){done.push_back(s);continue;}
    // 알레아 마탄: 작은 폭발로 주변 적에게 피해
    hb::Physics::SetVelocity(s,hb::Vec3{0,0,0});hb::Sprites::SetSprite(s,rules->BoomSprite);Sfx("Boom");shotBoom[s]=true;life=0.15f;
    for(auto* e:Enemies()){const auto d=hb::Scene::GetPosition(e)-p;const float len=Length(d);
      if(len<rules->BoomRadius&&len>0.05f)HitEnemy(e,d*(1/len),rules->BoomDamage*WeaponDamage()/rules->BoltDamage);}
  }
  for(auto* s:done){Give(shotPool,s);shots.erase(s);shotBoom.erase(s);}
}

void TopDownShooter::UpdateBullets(float delta,const hb::Vec3& position){
  for(auto it=bullets.begin();it!=bullets.end();){
    const auto p=hb::Scene::GetPosition(it->first);it->second-=delta;
    if(Hp>0&&Length(p-position)<rules->EnemyShotHit){DamagePlayer(1);it->second=0;}
    if(it->second<=0||std::fabs(p.x)>halfWidth||std::fabs(p.y)>halfHeight){Give(bulletPool,it->first);it=bullets.erase(it);}else ++it;
  }
}

// ---- 구역·장면 전환 ----------------------------------------------------------------

int TopDownShooter::AreaAt(float y) const{
  if(area<0)return y>exitY?0:-1;        // 거점 계단 끝을 넘으면 첫 방
  if(y>halfHeight+0.5f)return area+1;   // 위쪽 문을 지나면 다음 방 (보스방 위는 벽)
  if(y<-halfHeight-1)return area-1;     // 아래쪽 문을 지나면 앞 방(첫 방이면 거점)
  return area;
}

#define AURIC_RUN_INTS(X) X(FatigueMax) X(Fatigue) X(Hp) X(MaxHp) X(Kills) X(RoomClears) X(Swings) X(Hits) X(Shots) X(Flashbangs) X(Gold) X(Ore) X(Herb) \
  X(Monster) X(Bottle) X(WeaponLevel) X(Debt) X(LastRepaid) X(Enchant) X(Crafted) X(SofaLevel) X(HomeLevel) X(Phase) X(Character)
#define AURIC_RUN_BOOLS(X) X(HasReturnItem) X(Returning) X(ReturnSuccess) X(gatherTold)

void TopDownShooter::SaveRun(){
  // 장면을 넘어도 이어지는 진행: GameInstance(AuricSession)의 JSON에 둔다
  auto* game=hb::Game::GetInstance();if(!game)return;
  hb::Json run=hb::Json::object();
#define AURIC_PUT(name) run[#name]=name;
  AURIC_RUN_INTS(AURIC_PUT) AURIC_RUN_BOOLS(AURIC_PUT)
#undef AURIC_PUT
  hb::Json rooms=hb::Json::object();for(auto& [k,v]:roomState)rooms[std::to_string(k)]=v==1?0:v;  // 전투 중이던 방은 처음부터
  run["rooms"]=rooms;run["taken"]=std::vector<std::string>(taken.begin(),taken.end());
  run["facing"]={facing.x,facing.y};
  game->state["run"]=run;
  if(KeepProgress)hb::Save::Write("Auric.progress",{{"debt",Debt},{"sofa",SofaLevel},{"home",HomeLevel},{"character",Character}});
}

bool TopDownShooter::LoadRun(){
  auto* game=hb::Game::GetInstance();if(!game||!game->state.contains("run"))return false;
  const hb::Json run=game->state["run"];
#define AURIC_GET(name) if(run.contains(#name))name=run[#name].get<decltype(name)>();
  AURIC_RUN_INTS(AURIC_GET) AURIC_RUN_BOOLS(AURIC_GET)
#undef AURIC_GET
  const hb::Json rooms=run.value("rooms",hb::Json::object()),done=run.value("taken",hb::Json::array());
  for(auto& [k,v]:rooms.items())roomState[std::stoi(k)]=v.get<int>();
  for(auto& t:done)taken.insert(t.get<std::string>());
  if(run.contains("facing"))facing=hb::Vec3{run["facing"][0].get<float>(),run["facing"][1].get<float>(),0};
  return true;
}

void TopDownShooter::Leave(int to,const std::string& spawn){
  // 바닥에 남은 골드는 들고 간다. 전투 중엔 문이 잠겨 있어 적·탄 상태는 넘기지 않는다
  for(auto& [c,value]:coins){Gold+=value;Give(coinPool,c);}coins.clear();
  SaveRun();leaving=true;hb::Physics::SetVelocity(player,hb::Vec3{0,0,0});
  std::string scene=rules->HubScene;
  if(to>=0){scene=rules->DungeonScene;const auto at=scene.find('#');if(at!=std::string::npos)scene.replace(at,1,std::to_string(to));}
  hb::Scene::Open(scene,{{"spawn",spawn}});
}

void TopDownShooter::Begin(){
  // 장면 첫 프레임: 이 장면의 구역(RoomInfo), 상호작용 대상, 카메라를 찾고 진행을 이어받는다
  started=true;Hp=MaxHp;
  rules=&fallbackRules;for(auto* a:hb::Scene::GetAllActorsOfClass("AuricRules"))if(auto* r=dynamic_cast<AuricRules*>(a))rules=r;
  for(auto* a:hb::Scene::GetAllActorsOfClass("RoomInfo"))if(auto* r=dynamic_cast<RoomInfo*>(a)){
    area=r->Index;roomKind=r->Kind;halfWidth=r->HalfWidth;halfHeight=r->HalfHeight;exitY=r->ExitY;monsterDrop=r->MonsterDrop;}
  for(auto* a:hb::Scene::GetAllActorsOfClass("Interactable"))if(auto* i=dynamic_cast<Interactable*>(a))interactables.push_back(i);
  auto cams=hb::Scene::GetActorsWithTag("MainCamera");camera=cams.empty()?nullptr:cams.front();
  const bool carried=LoadRun();
  if(!carried&&KeepProgress){const auto p=hb::Save::Read("Auric.progress");
    if(p.is_object()){Debt=p.value("debt",Debt);SofaLevel=p.value("sofa",SofaLevel);HomeLevel=p.value("home",HomeLevel);MaxHp=3+SofaLevel;Hp=MaxHp;}}
  if(carried||area>=0)Phase=std::max(Phase,2);  // 장면을 넘어왔거나 던전에서 바로 시작하면 로딩·타이틀 생략
  for(auto it=interactables.begin();it!=interactables.end();)  // 이미 채집한 것은 치운다
    if(taken.count(std::to_string(area)+":"+(*it)->Kind)){hb::Scene::Destroy(*it);it=interactables.erase(it);}else ++it;
  RoomIndex=area;
  if(area>=0)Prewarm();
  if(Returning)StartReturnRoom();
  Hud();
}

void TopDownShooter::EnterRoom(){
  // 문을 지나 조금 들어오면 그 방의 적이 나오고 문이 잠긴다
  auto& state=roomState[area];if(state)return;
  if(roomKind!="Combat"&&roomKind!="Boss"){state=2;return;}  // 채집방·상점은 싸움 없음
  state=1;fightingRoom=area;SetDoor("Door.Top",true);SetDoor("Door.Bottom",true);
  for(auto* a:hb::Scene::GetAllActorsOfClass("SpawnPoint"))if(auto* s=dynamic_cast<SpawnPoint*>(a)){
    if(s->ReturnOnly)continue;hb::Transform t;t.position=hb::Scene::GetPosition(s);t.position.z=0.1f;
    if(auto* e=dynamic_cast<Enemy*>(hb::Scene::Spawn(s->EnemyBlueprint,t))){
      if(e->Boss){boss=e;BossHp=e->MaxHp;Say("boss",e->DisplayName,"또 빚쟁이냐. 네 뼈도 황금으로 칠해 주마.");}}}
  Hud();
}

void TopDownShooter::ClearRoom(){
  // 방 클리어: 문이 열리고 피로도 +1 (기획), 피로도가 가득 차면 쓰러짐
  roomState[fightingRoom]=2;SetDoor("Door.Top",false);SetDoor("Door.Bottom",false);fightingRoom=-1;
  RoomClears++;Fatigue++;if(Fatigue>=FatigueMax){Hp=0;gameOver=rules->RespawnDelay;}Hud();
}

void TopDownShooter::StartReturnRoom(){
  // 귀환 페이즈 (기획서 6-3): 방에 들어서면 무적 해골이 한꺼번에 나오고 아래쪽 문은 10번 때려야 열린다
  if(area<0){Returning=false;ReturnSuccess=true;Settle();return;}  // 거점에 닿으면 귀환 성공
  DoorHits=0;Fatigue++;if(Fatigue>=FatigueMax){Hp=0;gameOver=rules->RespawnDelay;}
  SetDoor("Door.Bottom",area>0);
  for(auto* a:hb::Scene::GetAllActorsOfClass("SpawnPoint"))if(auto* s=dynamic_cast<SpawnPoint*>(a)){
    if(!s->ReturnOnly)continue;hb::Transform t;t.position=hb::Scene::GetPosition(s);t.position.z=0.1f;
    if(auto* e=dynamic_cast<Enemy*>(hb::Scene::Spawn(s->EnemyBlueprint,t))){e->Invulnerable=true;e->Stun(0.8f);}}
}

void TopDownShooter::Settle(){
  // 정산 (기획서 6-4): 소재를 골드로 바꾸고 절반을 빚에서 자동 상환, 강화는 초기화
  const int total=Gold+Ore*rules->OrePrice+Herb*rules->HerbPrice+Monster*rules->MonsterPrice;
  LastRepaid=int(total*rules->RepayRate);Debt=std::max(0,Debt-LastRepaid);
  Gold=total-LastRepaid;Ore=Herb=Monster=0;WeaponLevel=0;Enchant=0;
  Say("collector","수금원","돌아왔네? 정산할게. 소재까지 합쳐 "+std::to_string(total)+" G, 그중 절반 "+std::to_string(LastRepaid)+" G는 빚으로 받아 간다.");
  Say("collector","수금원","남은 빚은 "+std::to_string(Debt)+" G. 강화는 던전 밖에선 무뎌지는 거 알지? 남은 골드로 소파라도 바꾸든가.");
  Say("collector","수금원","적당히 들어가서, 적당히 챙겨서, 지치기 전에 탈출. 그게 이 던전의 규칙이야. 쉬고 싶으면 계단 위 입구에서 하루를 마쳐.");
  SaveRun();Hud();
}

void TopDownShooter::ShowEnding(){
  ending=true;anyHeld=true;hb::Physics::SetVelocity(player,hb::Vec3{0,0,0});
  hb::UI::SetText(player,"HUD","EndingText",std::string(koreanNames[Character])+"의 남은 빚 "+std::to_string(Debt)+" G   ·   오늘 갚은 돈 "+std::to_string(LastRepaid)+" G");
  for(auto* n:{"EndingBack","EndingArt","EndingShade","EndingTitle","EndingText","EndingHint"})hb::UI::SetVisible(player,"HUD",n,true);
}

void TopDownShooter::ResetToTitle(){
  // 처음부터: GameInstance를 새로 만들고 거점을 다시 연다 (부스 F12·무입력·엔딩)
  leaving=true;hb::Game::Reset();  // 새 세션으로 시작 장면(거점)부터
}

std::string TopDownShooter::Sound(const std::string& name) const{
  if(!rules)return "";
  for(const auto& entry:rules->Sounds){const auto eq=entry.find('=');if(eq!=std::string::npos&&entry.compare(0,eq,name)==0)return entry.substr(eq+1);}
  return "";
}

void TopDownShooter::OnPlaySfx(const std::string&){}
void TopDownShooter::OnPlayMusic(const std::string&,const std::string&){}

// ---- 상호작용 (E) --------------------------------------------------------------------

void TopDownShooter::Interact(const hb::Vec3& position,bool pressed){
  // 가까운 대상의 안내 문구를 위에 띄우고 E로 쓴다. 문구·가격은 배치한 오브젝트(BP_Interactable)마다 다르다
  Interactable* best=nullptr;float bestLen=1e9f;
  for(auto* i:interactables){const float len=Length(hb::Scene::GetPosition(i)+hb::Vec3{0,-1.0f,0}-position);if(len<i->Range&&len<bestLen){bestLen=len;best=i;}}
  std::string next;const std::string kind=best?best->Kind:"";const int price=best?best->Price:0;
  const std::string text=best?best->Text:"";
  if(kind=="Ore"||kind=="Herb"){
    const bool ore=kind=="Ore";next=text.empty()?(ore?"E: 광물 채집 (30kg)":"E: 약초 채집 (3개)"):text;
    if(pressed){if(ore&&!gatherTold){gatherTold=true;Say(faces[Character],koreanNames[Character],"Q로 제작 창을 열어 보자. 약초 3개와 빈 병으로 회복 물약, 광물로 섬광탄.");}
      if(ore)Ore++;else Herb+=3;Fatigue++;Sfx("Gather");taken.insert(std::to_string(area)+":"+kind);
      interactables.erase(std::find(interactables.begin(),interactables.end(),best));hb::Scene::Destroy(best);next="";}
  }else if(kind=="Smith"){
    next=WeaponLevel?"대장장이: 이번 층 강화는 끝났어":"E: "+std::string(weapons[Character])+" 강화 +1 ("+std::to_string(price)+" G)";
    if(pressed&&!WeaponLevel&&Gold>=price){Gold-=price;WeaponLevel=1;Sfx("Coin");next=std::string(koreanNames[Character])+"의 "+weapons[Character]+" +1";}
  }else if(kind=="Stall"){
    next="E: 회복 물약 ("+std::to_string(price)+" G, 체력 +1)";
    if(pressed&&Gold>=price&&Hp<MaxHp){Gold-=price;Hp++;Sfx("Coin");}
  }else if(kind=="DebtBoard")next="부채 전광판 - "+std::string(koreanNames[Character])+" 남은 빚 "+std::to_string(Debt)+" G"+(LastRepaid?"  (지난 정산 "+std::to_string(LastRepaid)+" G 상환)":"");
  else if(kind=="Entrance"){next=ReturnSuccess?"E: 오늘은 여기까지 - 하루 마치기":text;if(pressed&&ReturnSuccess){ShowEnding();return;}}
  else if(kind=="Collector"){next=Gold>0?"E: 수금원에게 "+std::to_string(Gold)+" G 모두 갚기":text;
    if(pressed&&Gold>0){Debt=std::max(0,Debt-Gold);LastRepaid+=Gold;Gold=0;Sfx("Coin");next="수금원: 거래 감사합니다, 고객님";}}
  else if(kind=="Interior"){next=HomeLevel>=2?text:"E: 원룸 공사 Lv2 ("+std::to_string(price)+" G, 피로도 한계 +"+std::to_string(rules->HomeFatigueBonus)+")";
    if(pressed&&HomeLevel<2&&Gold>=price){Gold-=price;HomeLevel=2;Sfx("Coin");FatigueMax+=rules->HomeFatigueBonus;next="원룸이 넓어졌다!";}}
  else if(kind=="Sofa"){next=SofaLevel>=rules->SofaMax?text:"E: 소파 바꾸기 ("+std::to_string(price)+" G, 최대 체력 +1)";
    if(pressed&&SofaLevel<rules->SofaMax&&Gold>=price){Gold-=price;SofaLevel++;Sfx("Coin");MaxHp++;Hp=MaxHp;}}
  else next=text;  // Note: 가구·문 닫은 가게 등은 문구만
  if(next!=hint||pressed){hint=next;Hud();}
}

// ---- 제작 (Q) ------------------------------------------------------------------------

void TopDownShooter::CraftDetail(){
  static const char* names[]={"","회복 물약","섬광탄","각인 결정: 증폭","각인 결정: 화상","각인 결정: 검기·관통"};
  static const char* effects[]={"","체력 1 회복","1초 전체 스턴, 탄막 제거","무기공격력 +30%","맞은 적이 3초 동안 불탐",""};
  std::string cost;
  if(craftPick==1)cost="약초 "+std::to_string(Herb)+" / 3    빈 병 "+std::to_string(Bottle)+" / 1";
  else if(craftPick==2)cost="광물 "+std::to_string(Ore)+" / 1";
  else cost="마물 소재 "+std::to_string(Monster)+" / 1   (각인은 하나만, 새로 하면 덮어씀)";
  for(int i=1;i<=5;++i){  // 위젯 위치를 못 바꿔서 칸마다 둔 선택 테두리·설명 아이콘 중 하나만 보인다
    hb::UI::SetVisible(player,"HUD","CraftSelect"+std::to_string(i),craftOpen&&i==craftPick);
    hb::UI::SetVisible(player,"HUD","CraftDetail"+std::to_string(i),craftOpen&&i==craftPick);}
  hb::UI::SetText(player,"HUD","CraftName",names[craftPick]);
  hb::UI::SetText(player,"HUD","CraftEffect",craftPick==5?(Character?"화살·마탄이 적을 뚫고 지나감":"베기 사거리 +1.5m"):effects[craftPick]);
  hb::UI::SetText(player,"HUD","CraftType",craftPick<=2?"소모 아이템":"무기 각인 (귀환하면 사라짐)");
  hb::UI::SetText(player,"HUD","CraftCost",cost);
}

void TopDownShooter::Craft(bool toggle,int which,bool confirm){
  // 제작 창 (기획서 6-2-2): Q로 열고 닫음, 1~5 선택, Enter로 제작. 열려 있어도 게임은 계속된다
  static const char* parts[]={"CraftPanel","CraftTitle","CraftSub","CraftIcon1","CraftIcon2","CraftIcon3","CraftIcon4","CraftIcon5",
    "CraftKey1","CraftKey2","CraftKey3","CraftKey4","CraftKey5","CraftSlot1","CraftSlot2","CraftSlot3","CraftSlot4","CraftSlot5",
    "CraftName","CraftEffect","CraftType","CraftNeed","CraftCost","CraftConfirm","CraftConfirmButton","CraftClose","CraftFooter"};
  if(toggle){craftOpen=!craftOpen;for(auto* n:parts)hb::UI::SetVisible(player,"HUD",n,craftOpen);CraftDetail();}
  if(!craftOpen)return;
  if(which>0){craftPick=which;CraftDetail();Sfx("Select");}
  if(!confirm)return;
  bool done=false;
  if(craftPick==1&&Herb>=3&&Bottle>=1&&Hp<MaxHp){Herb-=3;Bottle--;Hp++;done=true;}
  else if(craftPick==2&&Ore>=1){Ore--;Flashbangs++;done=true;}
  else if(craftPick>=3&&Monster>=1){Monster--;Enchant=craftPick-2;done=true;}
  if(done){Crafted++;Sfx("Craft");hint=std::string("제작 완료: ")+(craftPick==1?"회복 물약":craftPick==2?"섬광탄":"각인 결정");}
  else hint="소재가 모자라요";
  CraftDetail();Hud();
}

// ---- 화면 ----------------------------------------------------------------------------

void TopDownShooter::Hud(){
  // 위젯 인스턴스는 첫 프레임 뒤에 생기므로 그 전에는 표시만 미룬다. 요소 이름은 tools/gen_hud.py의 W_TopDown
  if(frame<2||!player){hudDirty=true;return;}
  hudDirty=false;
  if(Phase>=2&&!introHidden){introHidden=true;
    for(auto* n:{"LoadingBack","LoadingCoin","LoadingText","TitleBack","TitleScreen","TitleHint"})hb::UI::SetVisible(player,"HUD",n,false);}
  const int hp=std::max(0,Hp);
  const bool rot=Returning;const int fill=hp<=0?0:std::max(1,(hp*3+MaxHp-1)/MaxHp);  // 귀환 중엔 황금 침식 테마
  hb::UI::SetVisible(player,"HUD","HpBack",!rot);
  for(int i=1;i<=3;++i){hb::UI::SetVisible(player,"HUD","HpFill"+std::to_string(i),!rot&&fill==i);hb::UI::SetVisible(player,"HUD","RotHp"+std::to_string(i),rot&&fill==i);}
  static const char* themed[][2]={{"DodgeButton","RotDodge"},{"InteractButton","RotInteract"},{"CraftButton","RotCraft"},{"PauseButton","RotPause"},{"BagButton","RotBag"},{"Minimap","RotMinimap"}};
  if(rot!=rotShown){rotShown=rot;for(auto& t:themed){hb::UI::SetVisible(player,"HUD",t[0],!rot);hb::UI::SetVisible(player,"HUD",t[1],rot);}}
  hb::UI::SetText(player,"HUD","HpText",std::to_string(hp)+" / "+std::to_string(MaxHp));
  hb::UI::SetText(player,"HUD","WeightText",std::to_string(Weight())+" / "+std::to_string(rules->WeightLimit));
  hb::UI::SetText(player,"HUD","GoldText",std::to_string(Gold)+" G   빚 "+std::to_string(Debt));
  hb::UI::SetText(player,"HUD","Hint",hint);
  for(int i=0;i<3;++i){hb::UI::SetVisible(player,"HUD",std::string("AttackButton_")+faces[i],!rot&&i==Character);
    hb::UI::SetVisible(player,"HUD",std::string("RotAttack_")+faces[i],rot&&i==Character);}
  const int level=std::min(10,FatigueMax>0?Fatigue*10/FatigueMax:10);  // 10% 단위 그림
  if(level!=fatigueLevel){auto name=[](int lv){std::string n=std::to_string(lv*10);return "Fatigue"+std::string(3-n.size(),'0')+n;};
    hb::UI::SetVisible(player,"HUD",name(fatigueLevel),false);hb::UI::SetVisible(player,"HUD",name(level),true);fatigueLevel=level;}
  hb::UI::SetText(player,"HUD","Title",Hp<=0?(Fatigue>=FatigueMax?"지쳐 쓰러졌다":"쓰러졌다")
    :ReturnSuccess?"귀환 성공 - 정산 "+std::to_string(LastRepaid)+" G 상환"
    :Returning?"귀환 - 문 "+std::to_string(DoorHits)+"/"+std::to_string(rules->DoorHitsToOpen)+"  섬광탄 "+(Flashbangs?std::to_string(Flashbangs):std::to_string(rules->FlashPrice)+"G")
    :HasReturnItem?"[귀환] 획득 - Tab으로 사용":boss?"해골 대장  "+std::to_string(int(std::ceil(BossHp)))+" HP":area<0?"거점":"탐색");
}

void TopDownShooter::Animate(float delta,bool moving){
  // 8방향: 그림은 남·남동·동·북동·북 5방향이고 서쪽 셋은 동쪽 그림을 뒤집는다
  // 프레임: 공격 3장(0.1초씩) > 걷기 4장(초당 8장) > 서 있기
  static const char* dirs[]={"E","NE","N","NE","E","SE","S","SE"};
  const int sector=((int)std::lround(Angle(facing)/45)%8+8)%8;
  const bool flip=sector>=3&&sector<=5;
  if(flip!=playerFlipped){playerFlipped=flip;hb::Sprites::SetFlip(player,flip,false);}
  std::string next=std::string(dirs[sector])+"_";
  if(charge>0)next+=charge<rules->ArrowCharge*0.5f?"Attack_0":"Attack_1";  // 셰리 장전: 시위 걸기 → 당기기
  else if(attackAnim>0){attackAnim-=delta;const int f=attackAnim>0.2f?0:attackAnim>0.1f?1:2;next+="Attack_"+std::to_string(f);}
  else if(moving){walkTime+=delta;next+="Walk_"+std::to_string(int(walkTime*8)%4);}
  else{walkTime=0;next+="Idle_0";}
  if(next!=currentSprite){currentSprite=next;if(Character<(int)rules->CharacterSprites.size())hb::Sprites::SetSprite(player,rules->CharacterSprites[Character]+next+".hbsprite.json");}
}

static size_t Utf8Count(const std::string& s){size_t n=0;for(unsigned char ch:s)n+=(ch&0xC0)!=0x80;return n;}
static std::string Utf8Prefix(const std::string& s,size_t chars){size_t i=0,n=0;
  while(i<s.size()){if(((unsigned char)s[i]&0xC0)!=0x80){if(n==chars)break;n++;}i++;}return s.substr(0,i);}

bool TopDownShooter::UpdateDialog(float delta,bool advance){
  // 대화창 (기획서 6-5): 한 글자씩 → E·클릭·Enter로 바로 다 보이기 → 다시 누르면 다음 줄
  static const char* parts[]={"DialogBox","DialogPortraitFrame","DialogName","DialogText","DialogNext","DialogTouch"};
  static const char* portraits[]={"collector","valen","sherry","alea","boss"};
  if(dialogIndex>=dialog.size()){
    if(!dialog.empty()){dialog.clear();dialogIndex=0;for(auto* n:parts)hb::UI::SetVisible(player,"HUD",n,false);
      for(auto* f:portraits)hb::UI::SetVisible(player,"HUD",std::string("DialogPortrait_")+f,false);shownWho="";}
    return false;
  }
  const Line& l=dialog[dialogIndex];
  if(shownWho!=l.who){
    if(shownWho.empty())for(auto* n:parts)hb::UI::SetVisible(player,"HUD",n,true);
    for(auto* f:portraits)hb::UI::SetVisible(player,"HUD",std::string("DialogPortrait_")+f,l.who==f);
    hb::UI::SetText(player,"HUD","DialogName",l.name);shownWho=l.who;
  }
  const size_t total=Utf8Count(l.text);
  if(advance){
    Sfx("Select");if(shownChars<total)shownChars=total;
    else{dialogIndex++;shownChars=0;typeTime=0;if(dialogIndex<dialog.size()&&dialog[dialogIndex].who==shownWho)hb::UI::SetText(player,"HUD","DialogName",dialog[dialogIndex].name);
      hb::UI::SetText(player,"HUD","DialogText","");return true;}
  }else if(shownChars<total){typeTime+=delta;const size_t next=std::min(total,size_t(typeTime*rules->TypeSpeed));if(next==shownChars)return true;shownChars=next;}
  else return true;
  hb::UI::SetText(player,"HUD","DialogText",Utf8Prefix(l.text,shownChars));
  hb::UI::SetVisible(player,"HUD","DialogNext",shownChars>=total);
  return true;
}

void TopDownShooter::ShowSelect(bool visible){
  for(auto* n:{"SelectBack","SelectTitle","SelectHint","SelectConfirm"})hb::UI::SetVisible(player,"HUD",n,visible);
  for(int i=0;i<3;++i){const std::string k=std::to_string(i);
    for(auto* n:{"SelectCard","SelectArt","SelectName","SelectWeapon","SelectDebt","SelectTouch"})hb::UI::SetVisible(player,"HUD",n+k,visible);
    hb::UI::SetVisible(player,"HUD","SelectPick"+k,visible&&i==pick);}
}

bool TopDownShooter::UpdateIntro(float delta,bool anyKey){
  // 로딩(금화 GIF) → 타이틀(아무 키) → 캐릭터 선택 → 오프닝 대화 (기획서 2장)
  if(Phase>=2)return false;
  phaseTime+=delta;hb::Physics::SetVelocity(player,hb::Vec3{0,0,0});
  if(Phase==0&&phaseTime>=rules->LoadingTime){Phase=1;phaseTime=0;
    for(auto* n:{"LoadingBack","LoadingCoin","LoadingText"})hb::UI::SetVisible(player,"HUD",n,false);}
  else if(Phase==1&&!selecting&&anyKey&&phaseTime>0.3f){selecting=true;phaseTime=0;
    for(auto* n:{"TitleBack","TitleScreen","TitleHint"})hb::UI::SetVisible(player,"HUD",n,false);introHidden=true;confirmHeld=true;ShowSelect(true);}
  else if(Phase==1&&selecting){
    // 1·2·3 또는 A·D로 고르고 Enter·E로 결정. 카드를 누르면 그 숫자 키가 눌린다
    int key=0;for(int i=1;i<=3;++i)if(hb::Input::IsKeyDown(std::to_string(i)))key=i;
    const int side=hb::Input::IsKeyDown("d")?4:hb::Input::IsKeyDown("a")?5:0;const int now=key?key:side;
    if(now&&now!=pickHeld){pick=key?key-1:(pick+(side==4?1:2))%3;ShowSelect(true);Sfx("Select");}
    pickHeld=now;
    const bool confirm=hb::Input::IsKeyDown("enter")||hb::Input::IsKeyDown("e")||hb::Input::IsKeyDown("space");
    const bool fresh=confirm&&!confirmHeld;confirmHeld=confirm;
    if(!fresh)return true;
    selecting=false;Phase=2;Character=pick;if(pick<(int)rules->Debts.size())Debt=rules->Debts[pick];currentSprite="";ShowSelect(false);advanceHeld=true;Animate(0,false);Hud();
    static const char* lines[]={"...갚으면 되는 거지.","술값 정도는 나오겠지?","확률은... 나쁘지 않네."};
    Say("collector","수금원","어서 와. 오늘부터 여기가 네 집이야. 물론 집주인은 우리 사장님이지만.");
    Say("collector","수금원","저 위 계단 끝에 있는 게 '마몬의 입'이야. 들어간 놈들은 황금을 들고 나오거나, 아예 안 나오지.");
    Say(faces[pick],koreanNames[pick],lines[pick]);
    Say("collector","수금원","하나만 기억해. 너무 깊이 들어가면 못 돌아와. 적당히 챙겨서, 지치기 전에 나와.");
    Say("collector","수금원","아, 튜토리얼용 제작서랑 빈 병도 챙겨 가. 공짜는 아니고, 빚에 달아 둘게.");
  }
  return Phase<2;
}

void TopDownShooter::MoveCamera(const hb::Vec3& position,const hb::Vec3& aim,bool hasAim,float delta){
  // 엔터 더 건전·소울 나이트처럼 조준 쪽으로 끌려가며 부드럽게 따라간다
  if(!camera)return;
  hb::Vec3 target=position;
  if(hasAim)target=target+hb::VectorMath::ClampVectorLength((aim-position)*rules->CameraLead,rules->CameraLeadMax);
  target.z=hb::Scene::GetPosition(camera).z;
  if(!cameraReady){cameraAt=target;cameraReady=true;}else cameraAt=hb::VectorMath::VInterpTo(cameraAt,target,delta,rules->CameraFollow);
  auto at=cameraAt;
  if(shake>0){shake-=delta;const float a=rules->ShakeAmount;at.x+=a*(std::rand()%201-100)/100;at.y+=a*(std::rand()%201-100)/100;}  // 때렸을 때 흔들림
  hb::Scene::SetPosition(camera,at);
}

// ---- 한 프레임 ------------------------------------------------------------------------

void TopDownShooter::Update(float delta){
  Current=this;
  player=hb::Gameplay::GetPlayerPawn();if(!player)return;
  frame++;if(hudDirty)Hud();
  if(!started)Begin();
  if(leaving)return;
  playerAt=hb::Scene::GetPosition(player);
  const auto position=playerAt;
  {// 배경음: 거점·던전·보스방·귀환
   const std::string music=Sound(Returning?"Return":area<0?"Hub":roomKind=="Boss"?"Boss":"Dungeon");
   if((Phase>=2||selecting)&&music!=currentMusic&&!Muted()){OnPlayMusic(music,currentMusic);currentMusic=music;}}  // 브라우저 소리는 첫 입력 뒤에만 켜짐
  {// 부스 운영 (기획서 10장): F12 바로 처음으로, 60초 무입력이면 처음으로, 엔딩 카드에서 아무 키나 누르면 처음으로
   bool any=hb::VectorMath::Vector2Length(hb::Input::GetMouseDelta())>0;
   for(auto* k:{"w","a","s","d","e","q","space","enter","tab","LeftMouseButton","k","1","2","3","4","5"})any=any||hb::Input::IsKeyDown(k);
   const bool anyPressed=any&&!anyHeld;anyHeld=any;idleTime=any?0:idleTime+delta;
   if(hb::Input::IsKeyDown("F12")||(idleTime>=rules->IdleReset&&!(Phase<2&&!selecting))||(ending&&anyPressed)){ResetToTitle();return;}
   if(ending)return;
   if(Phase>=2&&!Returning&&!ReturnSuccess&&area>=0&&roomKind!="Boss"){runTime+=delta;
     if(runTime>=rules->RunNotice){if(hint.empty()){hint="10분이 지났어요 - F10을 누르면 보스방 앞으로";Hud();}
       if(hb::Input::IsKeyDown("F10")){runTime=0;Leave(rules->BossRoom,"DoorBottom");return;}}}}
  hb::Vec3 aim;const bool hasAim=hb::Input::GetMouseWorldPosition(hb::Vec3{0,0,1},position,aim);
  // 모바일 공격 버튼은 K. 터치 위치는 조준이 아니라서 자동 조준·바라보는 방향으로 카메라를 끈다
  if(hb::Input::IsKeyDown("k"))touchMode=true;else if(hb::Input::IsKeyDown("LeftMouseButton"))touchMode=false;
  MoveCamera(position,touchMode?position+facing*(rules->CameraLeadMax/rules->CameraLead*0.5f):aim,(hasAim||touchMode)&&Phase>=2,delta);
  {const bool adv=hb::Input::IsKeyDown("e")||hb::Input::IsKeyDown("LeftMouseButton")||hb::Input::IsKeyDown("enter")||hb::Input::IsKeyDown("space");
   const bool pressed=adv&&!advanceHeld;advanceHeld=adv;
   if(frame>=2&&UpdateIntro(delta,pressed))return;
   if(UpdateDialog(delta,pressed)){flashHeld=true;dodgeHeld=true;attackCooldown=0.2f;hb::Physics::SetVelocity(player,hb::Vec3{0,0,0});return;}}  // 대화 중엔 행동·이동 막음
  {const int to=AreaAt(position.y);  // 다른 구역으로 넘어감: 넘어간 장면의 문 안쪽에서 시작
   if(to!=area){Leave(to,to<0?"StairTop":to>area?"DoorBottom":"DoorTop");return;}}
  if(area>=0&&!Returning&&!ReturnSuccess&&(position.y>-halfHeight+rules->EnterDepth||area==0))EnterRoom();

  std::vector<Enemy*> enemies;
  for(auto* e:Enemies()){e->Tick(delta);  // 적 이동은 여기서 한 번에 (상태 머신은 상태가 바뀔 때만 C++를 부름)
    if(e->burnedOut){e->burnedOut=false;KillEnemy(e);}else enemies.push_back(e);}  // 화상으로 쓰러짐
  boss=nullptr;for(auto* e:enemies)if(e->Boss)boss=e;  // 적 포인터는 프레임을 넘겨 들고 있지 않는다 (엔진이 다시 만들 수 있음)
  UpdateBullets(delta,position);
  UpdateFx(delta);
  if(Hp<=0){  // 쓰러짐: 3초 뒤 회복 (ponytail: 정산 화면이 생기면 거기로)
    hb::Physics::SetVelocity(player,hb::Vec3{0,0,0});gameOver-=delta;
    for(auto& [b,life]:bullets)hb::Physics::SetVelocity(b,hb::Vec3{0,0,0});
    if(gameOver<=0){Hp=MaxHp;Fatigue=0;invulnerable=rules->InvulnerableTime*2;Hud();}
    return;
  }

  // 조준: 마우스 방향, 모바일은 가장 가까운 적, 없으면 이동 방향
  const hb::Vec3 move{hb::Input::GetAxis("d")-hb::Input::GetAxis("a"),hb::Input::GetAxis("w")-hb::Input::GetAxis("s"),0};
  const bool moving=hb::VectorMath::VectorLengthSquared(move)>.01f;
  if(moving)facing=hb::VectorMath::NormalizeVector(move);
  if(touchMode){float best=rules->AutoAimRange;Enemy* target=nullptr;
    for(auto* e:enemies){const float len=Length(hb::Scene::GetPosition(e)-position);if(len<best){best=len;target=e;}}
    if(target)facing=Normal(hb::Scene::GetPosition(target)-position,facing);}
  else if(hasAim)facing=Normal(aim-position,facing);
  Animate(delta,moving);
  // 적재량 초과·피로도 75% 이상이면 이동속도 -25% (기획서 4-1)
  if(dodgeTimer<=0&&(Weight()>rules->WeightLimit||Fatigue*4>=FatigueMax*3))hb::Physics::SetVelocity(player,hb::Physics::GetVelocity(player)*rules->SlowRate);
  attackCooldown-=delta;dodgeCooldownLeft-=delta;invulnerable-=delta;

  // 회피: Space를 누른 순간 바라보는 방향으로 대시, 대시 중 무적
  const bool dodgeDown=hb::Input::IsKeyDown("space")||hb::Input::IsKeyDown(" ");
  if(dodgeDown&&!dodgeHeld&&dodgeCooldownLeft<=0&&dodgeTimer<=0){dodgeTimer=rules->DodgeTime;dodgeCooldownLeft=rules->DodgeCooldown;Sfx("Dodge");}
  dodgeHeld=dodgeDown;
  if(dodgeTimer>0){dodgeTimer-=delta;hb::Physics::SetVelocity(player,facing*rules->DodgeSpeed);}

  // [귀환] 사용 (가방 Tab), 귀환 중 섬광탄 (E): 제작한 것 먼저, 없으면 골드
  const bool tab=hb::Input::IsKeyDown("tab");
  if(tab&&!returnHeld&&HasReturnItem&&!Returning&&!ReturnSuccess){HasReturnItem=false;Returning=true;DoorHits=0;SetDoor("Door.Bottom",area>0);Hud();
    Say(faces[Character],koreanNames[Character],"던전이 놓아주지 않는다. 문을 10번 때려 열고, 막히면 E로 섬광탄!");}
  returnHeld=tab;
  const bool flash=hb::Input::IsKeyDown("e");
  if(!Returning)Interact(position,flash&&!flashHeld);
  else if(flash&&!flashHeld&&(Flashbangs>0||Gold>=rules->FlashPrice)){if(Flashbangs>0)Flashbangs--;else Gold-=rules->FlashPrice;StunAll(rules->FlashStun);Sfx("Flash");
    for(auto& [b,life]:bullets)life=0;Hud();}
  flashHeld=flash;
  {const bool q=hb::Input::IsKeyDown("q"),enter=hb::Input::IsKeyDown("enter");int which=0;
   for(int i=1;i<=5;++i)if(hb::Input::IsKeyDown(std::to_string(i)))which=i;
   Craft(q&&!craftKeyHeld,which,enter&&!confirmHeld);craftKeyHeld=q;confirmHeld=enter;}

  // 공격: 발렌 검 베기, 셰리 1초 장전 활, 알레아 마탄 연사
  const bool attackDown=hb::Input::IsKeyDown("LeftMouseButton")||hb::Input::IsKeyDown("k");
  if(Character==1){if(attackDown&&attackCooldown<=0){charge+=delta;if(charge>=rules->ArrowCharge){Shoot(position);charge=0;attackAnim=0.1f;attackCooldown=0.15f;}}else charge=0;}
  else if(Character==2&&attackDown&&attackCooldown<=0){attackCooldown=rules->BoltInterval;attackAnim=0.2f;Shoot(position);}
  else if(Character==0&&attackDown&&attackCooldown<=0)Slash(position,enemies);
  UpdateShots(delta,enemies);

  // 골드: 가까이 가면 끌려와서 주워짐
  for(auto it=coins.begin();it!=coins.end();){auto* c=it->first;const auto d=position-hb::Scene::GetPosition(c);const float len=Length(d);
    if(len<rules->CoinPickup){Gold+=it->second;Sfx("Coin");Give(coinPool,c);it=coins.erase(it);Hud();continue;}
    if(len<rules->CoinMagnet)hb::Scene::SetPosition(c,hb::Scene::GetPosition(c)+d*(std::min(1.f,delta*8)));
    ++it;}
  if(boss)BossHp=boss->Hp;
  if(fightingRoom>=0&&Enemies().empty())ClearRoom();
}
