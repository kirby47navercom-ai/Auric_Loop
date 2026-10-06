#include "TopDownShooter.h"
#include <random>
#include <map>
#include <cmath>
#include <string>
#include <algorithm>
#include <sstream>

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
  // 맞은 순간 하얗게 번쩍, 보스가 아니면 밀려나며 잠깐 경직(상태 머신이 맞는 그림)
  hb::Sprites::Flash(this,0.12f,1.f);
  if(!Boss){stun=std::max(stun,stunSeconds);sentVelocity=push;hb::Physics::SetVelocity(this,sentVelocity);}
  return Hp<=0.001f;  // 소수 오차로 0에 못 닿는 경우
}

// =====================================================================================
// 던전 층 생성·배치
// 장면 Dungeon에 tools/gen_scene.py가 놓은 풀 (태그 Dungeon.*): 화면 밖(y -200)에 세워 두고 여기서 옮겨 쓴다 (parked는 아래 탄 풀과 같음)
static const hb::Vec3 parked{0,-200,0};
static constexpr float CORRIDOR=2;  // 복도 반폭 (문 폭 4m)

static std::vector<std::string> Split(const std::string& text,char sep){
  std::vector<std::string> out;std::stringstream ss(text);std::string item;
  while(std::getline(ss,item,sep))if(!item.empty())out.push_back(item);
  return out;
}

void Dungeon::Generate(unsigned seed,const hb::Json& floor,const hb::Json& table){
  std::mt19937 rng(seed);
  auto pick=[&](int n){return std::uniform_int_distribution<int>(0,n-1)(rng);};
  const auto kinds=Split(floor.value("path",std::string("Start,Combat,Combat,Gather,Combat,Shop,Boss")),',');
  const auto branches=Split(floor.value("branches",std::string("Combat")),',');
  const float spacing=floor.value("spacing",36.f);
  // 주 경로: 격자 위 무작위 걷기. 막다른 길이면 처음부터 다시 (칸이 넉넉해 몇 번이면 됨)
  std::map<std::pair<int,int>,int> cells;
  auto add=[&](const std::string& kind,int gx,int gy,int from,int dir){
    DungeonRoom r;r.kind=kind;r.gx=gx;r.gy=gy;rooms.push_back(r);const int i=int(rooms.size())-1;cells[{gx,gy}]=i;
    if(from>=0){rooms[from].link[dir]=i;rooms[i].link[(dir+2)%4]=from;}
    return i;};
  for(int attempt=0;attempt<500;++attempt){
    rooms.clear();cells.clear();
    int last=add(kinds[0],0,0,-1,0);rooms[last].path=0;bool ok=true;
    for(size_t k=1;k<kinds.size()&&ok;++k){
      std::vector<int> dirs;
      for(int d=0;d<4;++d)if(!cells.count({rooms[last].gx+dx[d],rooms[last].gy+dy[d]}))dirs.push_back(d);
      if(dirs.empty()){ok=false;break;}
      const int d=dirs[pick(int(dirs.size()))];
      last=add(kinds[k],rooms[last].gx+dx[d],rooms[last].gy+dy[d],last,d);rooms[last].path=int(k);
    }
    if(!ok)continue;
    // 곁가지: 시작·보스가 아닌 주 경로 방 옆 빈 칸에 붙인다 (보스 방 옆 칸은 피함: 보스 방 문은 하나)
    for(const auto& kind:branches){
      std::vector<std::pair<int,int>> spots;
      for(int i=0;i<int(rooms.size());++i){if(rooms[i].path<=0||rooms[i].kind=="Boss")continue;
        for(int d=0;d<4;++d){const int x=rooms[i].gx+dx[d],y=rooms[i].gy+dy[d];bool nearBoss=false;
          for(int e=0;e<4;++e){auto it=cells.find({x+dx[e],y+dy[e]});if(it!=cells.end()&&rooms[it->second].kind=="Boss")nearBoss=true;}
          if(!cells.count({x,y})&&!nearBoss)spots.push_back({i,d});}}
      if(spots.empty()){ok=false;break;}
      const auto [i,d]=spots[pick(int(spots.size()))];add(kind,rooms[i].gx+dx[d],rooms[i].gy+dy[d],i,d);
    }
    if(ok)break;
  }
  // 크기·데이터 행: 전투방은 경로 순서대로 Combat1·2·3, 곁가지 전투방은 Branch
  int combat=0;
  for(auto& r:rooms){
    r.row=r.kind=="Combat"?(r.path<0?std::string("Branch"):"Combat"+std::to_string(++combat)):r.kind;
    const hb::Json row=table.contains(r.row)?table.at(r.row):hb::Json::object();
    const int lo=int(row.value("minHalf",8.f)),hi=std::max(lo,int(row.value("maxHalf",10.f)));
    r.hw=float(lo+pick(hi-lo+1));r.hh=row.value("square",false)?r.hw:float(lo+pick(hi-lo+1));
    r.cx=r.gx*spacing;r.cy=r.gy*spacing;
    if(r.kind=="Boss")boss=int(&r-&rooms[0]);
  }
  gates.assign(rooms.size()*4,nullptr);
}

int Dungeon::RoomAt(const hb::Vec3& p) const{
  for(int i=0;i<int(rooms.size());++i)if(rooms[i].Inside(p))return i;
  return -1;
}

int Dungeon::PathRoom(int order) const{
  for(int i=0;i<int(rooms.size());++i)if(rooms[i].path==order)return i;
  return -1;
}

hb::Vec3 Dungeon::DoorPosition(int room,int dir) const{
  const auto& r=rooms[room];
  return {r.cx+dx[dir]*(r.hw+0.5f),r.cy+dy[dir]*(r.hh+0.5f),0};
}

// 반복 무늬 스프라이트 하나를 사각형 [x0,x1]×[y0,y1]에 깐다. collider: 0 없음, 1 전체, 2 아래 1m (위로 솟은 벽면)
static void Put(std::vector<hb::Actor*>& pool,float x0,float y0,float x1,float y1,int collider){
  if(pool.empty()||x1-x0<0.05f||y1-y0<0.05f)return;
  auto* a=pool.back();pool.pop_back();const float w=x1-x0,h=y1-y0;
  hb::Scene::SetPosition(a,hb::Vec3{(x0+x1)/2,(y0+y1)/2,0.05f});hb::Sprites::SetSize(a,hb::Vec2{w,h});
  if(collider==1){hb::Components::SetVector(a,"BoxCollider2D","extent",hb::Vec3{w/2,h/2,0.5f});hb::Components::SetVector(a,"BoxCollider2D","center",hb::Vec3{0,0,0});}
  if(collider==2){hb::Components::SetVector(a,"BoxCollider2D","extent",hb::Vec3{w/2,0.5f,0.5f});hb::Components::SetVector(a,"BoxCollider2D","center",hb::Vec3{0,-h/2+0.5f,0});}
}

static void Move(std::vector<hb::Actor*>& pool,float x,float y){
  if(pool.empty())return;auto* a=pool.back();pool.pop_back();hb::Scene::SetPosition(a,hb::Vec3{x,y,0.05f});
}

void Dungeon::Build(){
  auto floors=hb::Scene::GetActorsWithTag("Dungeon.Floor"),caps=hb::Scene::GetActorsWithTag("Dungeon.Cap"),faces=hb::Scene::GetActorsWithTag("Dungeon.Face");
  auto arches=hb::Scene::GetActorsWithTag("Dungeon.Arch"),torches=hb::Scene::GetActorsWithTag("Dungeon.Torch"),glows=hb::Scene::GetActorsWithTag("Dungeon.Glow");
  auto banners=hb::Scene::GetActorsWithTag("Dungeon.Banner"),pillars=hb::Scene::GetActorsWithTag("Dungeon.Pillar");
  auto rubble=hb::Scene::GetActorsWithTag("Dungeon.Rubble"),bones=hb::Scene::GetActorsWithTag("Dungeon.Bones"),gold=hb::Scene::GetActorsWithTag("Dungeon.Gold");
  gateFree=hb::Scene::GetActorsWithTag("Dungeon.Gate");sideFree=hb::Scene::GetActorsWithTag("Dungeon.GateSide");
  {auto s=hb::Scene::GetActorsWithTag("Dungeon.Stairs");stairs=s.empty()?nullptr:s.front();}
  std::mt19937 rng(unsigned(rooms.size()*7919+rooms[0].hw*31+rooms.back().gx*17));
  auto between=[&](float a,float b){return std::uniform_real_distribution<float>(a,b)(rng);};
  const float C=CORRIDOR;
  for(int i=0;i<int(rooms.size());++i){
    auto& r=rooms[i];const float x0=r.cx-r.hw,x1=r.cx+r.hw,y0=r.cy-r.hh,y1=r.cy+r.hh;
    Put(floors,x0,y0,x1,y1,0);
    // 북쪽 벽: 위로 솟은 벽면 3m (아래 1m만 막힘). 문이 있으면 가운데를 비우고 아치를 세운다
    std::vector<std::pair<float,float>> north;
    if(r.link[0]<0)north.push_back({x0,x1});else{north.push_back({x0,r.cx-C});north.push_back({r.cx+C,x1});Move(arches,r.cx,y1+1.5f);}
    for(auto [a,b]:north){Put(faces,a,y1,b,y1+3,2);
      for(float x=a+2.5f;x<b-1.5f;x+=6){Move(torches,x,y1+1.1f);Move(glows,x,y1+1.45f);}
      if(b-a>9)Move(banners,(a+b)/2,y1+1.6f);}
    // 남쪽 벽(윗면 1m), 서·동 벽(윗면, 북쪽 벽면 높이까지)
    if(r.link[2]<0)Put(caps,x0-1,y0-1,x1+1,y0,1);else{Put(caps,x0-1,y0-1,r.cx-C,y0,1);Put(caps,r.cx+C,y0-1,x1+1,y0,1);}
    for(int side:{3,1}){const float a=side==3?x0-1:x1,b=a+1;
      if(r.link[side]<0)Put(caps,a,y0,b,y1+3,1);else{Put(caps,a,y0,b,r.cy-C,1);Put(caps,a,r.cy+C,b,y1+3,1);}}
    // 복도: 북쪽·동쪽으로 이어진 것만 (반대쪽은 상대 방이 깖)
    if(r.link[0]>=0){const auto& n=rooms[r.link[0]];const float top=n.cy-n.hh;
      Put(floors,r.cx-C,y1,r.cx+C,top,0);Put(caps,r.cx-C-1,y1,r.cx-C,top-1,1);Put(caps,r.cx+C,y1,r.cx+C+1,top-1,1);}
    if(r.link[1]>=0){const auto& e=rooms[r.link[1]];const float right=e.cx-e.hw;
      Put(floors,x1,r.cy-C,right,r.cy+C,0);Put(faces,x1+1,r.cy+C,right-1,r.cy+C+3,2);Put(caps,x1+1,r.cy-C-1,right-1,r.cy-C,1);}
    // 장식: 전투·보스방은 기둥(엄폐물), 바닥엔 잔해·뼈, 보스·채집방엔 금화 더미
    r.blocked.clear();
    const int count=r.kind=="Boss"?4:r.kind=="Combat"?int(between(0,4.99f)):0;
    for(int k=0,tries=0;k<count&&tries<40;++tries){
      const hb::Vec3 p{between(x0+3,x1-3),between(y0+3,y1-3),0};
      if(std::fabs(p.x-r.cx)<3||std::fabs(p.y-r.cy)<3)continue;  // 문에서 문으로 가는 길은 비움
      bool near=false;for(auto& q:r.blocked)near=near||std::hypot(q.x-p.x,q.y-p.y)<3.5f;if(near)continue;
      r.blocked.push_back(p);Move(pillars,p.x,p.y+0.6f);++k;}
    for(int k=0,n=int(r.hw*r.hh/30);k<n;++k){const float x=between(x0+1,x1-1),y=between(y0+1,y1-1);
      if(std::fabs(x-r.cx)<2&&std::fabs(y-r.cy)<2)continue;
      auto& pool=(r.kind=="Boss"||r.kind=="Gather")&&k%3==0?gold:k%2?bones:rubble;Move(pool,x,y);}
  }
  if(stairs)hb::Scene::SetPosition(stairs,hb::Vec3{rooms[start].cx-rooms[start].hw+2.2f,rooms[start].cy+rooms[start].hh-1.6f,0.05f});  // 문(벽 가운데)을 막지 않게 왼쪽 위 구석
}

void Dungeon::Lock(int room,bool locked,int only){
  const auto& r=rooms[room];
  for(int d=0;d<4;++d){if(r.link[d]<0||(only>=0&&d!=only))continue;
    auto& g=gates[room*4+d];auto& pool=d%2?sideFree:gateFree;
    if(locked&&!g&&!pool.empty()){g=pool.back();pool.pop_back();
      const float x0=r.cx-r.hw,x1=r.cx+r.hw,y0=r.cy-r.hh,y1=r.cy+r.hh;
      // 위 문은 아치 안의 큰 철창, 아래 문은 낮은 철창, 옆문은 옆에서 본 철창 (철창 그림·충돌은 장면 풀에 정해 둠)
      const hb::Vec3 at=d==0?hb::Vec3{r.cx,y1+1.5f,0.06f}:d==2?hb::Vec3{r.cx,y0-0.4f,0.06f}:hb::Vec3{d==1?x1+0.5f:x0-0.5f,r.cy+0.3f,0.06f};
      hb::Scene::SetPosition(g,at);
      if(d==0){hb::Sprites::SetSize(g,hb::Vec2{4,3});hb::Components::SetVector(g,"BoxCollider2D","center",hb::Vec3{0,-1,0});}
      if(d==2){hb::Sprites::SetSize(g,hb::Vec2{4,1.6f});hb::Components::SetVector(g,"BoxCollider2D","center",hb::Vec3{0,0,0});}}
    else if(!locked&&g){hb::Scene::SetPosition(g,parked);pool.push_back(g);g=nullptr;}
  }
}

hb::Json Dungeon::Describe() const{
  hb::Json list=hb::Json::array();
  for(const auto& r:rooms)list.push_back({{"kind",r.kind},{"row",r.row},{"x",r.cx},{"y",r.cy},{"hw",r.hw},{"hh",r.hh},{"path",r.path},{"state",r.state}});
  return list;
}

// =====================================================================================
// 게임 규칙
// =====================================================================================

std::vector<Enemy*> TopDownShooter::Enemies() const{
  std::vector<Enemy*> list;
  for(auto* a:hb::Scene::GetAllActorsOfClass("Enemy"))if(auto* e=dynamic_cast<Enemy*>(a))list.push_back(e);
  return list;
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

hb::Actor* TopDownShooter::Take(std::vector<hb::Actor*>& pool,const std::string& prefab,const hb::Transform& at){
  if(!pool.empty()){auto* a=pool.back();pool.pop_back();hb::Scene::SetTransform(a,at);return a;}
  return hb::Scene::Spawn(prefab,at);  // 모자랄 때만 새로 생성 (끊김 감수)
}

void TopDownShooter::Give(std::vector<hb::Actor*>& pool,hb::Actor* actor){
  if(&pool==&bulletPool||&pool==&shotPool)hb::Physics::SetVelocity(actor,hb::Vec3{0,0,0});  // 골드·이펙트는 물리 몸체가 없다
  hb::Scene::SetPosition(actor,parked);pool.push_back(actor);
}

void TopDownShooter::PlayFx(const std::string& clip,float length,const hb::Vec3& at,float angle,float glow,bool flipX,bool flipY){
  hb::Transform t;t.position=at;t.rotation=hb::Vec3{0,0,angle};
  auto* a=Take(fxPool,rules->FxPrefab,t);if(!a)return;
  hb::Components::SetFloat(a,"SpriteRenderer","emissiveIntensity",glow);hb::Sprites::SetFlip(a,flipX,flipY);hb::Sprites::PlayAnimation(a,clip,false);
  fxs.push_back(Fx{a,length});
}

void TopDownShooter::UpdateFx(float delta){
  for(auto it=fxs.begin();it!=fxs.end();)
    if((it->left-=delta)<=0){Give(fxPool,it->actor);it=fxs.erase(it);}else ++it;
}

void TopDownShooter::Prewarm(){
  bulletPool=hb::Scene::GetActorsWithTag("Pool.EnemyShot");
  shotPool=hb::Scene::GetActorsWithTag("Pool.PlayerShot");
  coinPool=hb::Scene::GetActorsWithTag("Pool.Coin");
  fxPool=hb::Scene::GetActorsWithTag("Pool.Fx");
}

void TopDownShooter::KillEnemy(Enemy* e){
  const auto at=hb::Scene::GetPosition(e);Kills++;Sfx("Kill");if(waveAlive>0)waveAlive--;
  DropCoin(at,e->GoldMin+Kills%std::max(1,e->GoldMax-e->GoldMin+1));
  if(e->Boss){HasReturnItem=true;Monster++;boss=nullptr;BossHp=0;Hud();}
  if(monsterDrop&&fightingRoom>=0&&pending.empty()&&wave+1>=waves.size()&&Enemies().size()<=1)Monster++;  // 이 방 마지막 해골은 마물 소재 확정
  PlayFx(e->DeathClip,0.9f,at,0,0,e->Flipped());  // 쓰러지는 그림은 이펙트로 (적 오브젝트는 바로 지움)
  hb::Scene::Destroy(e);
}

bool TopDownShooter::HitEnemy(Enemy* e,const hb::Vec3& push,float damage){
  Hits++;Sfx("Hit");
  // 타격감: 맞은 자리에 불꽃, 화면 살짝 흔들림, 밀려남
  const auto at=hb::Scene::GetPosition(e);
  PlayFx(rules->HitClip,0.16f,hb::Vec3{at.x-push.x*0.3f,at.y-push.y*0.3f+0.2f,0.3f},float(std::rand()%360),1.5f,false);
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
  PlayFx(rules->SlashClip,0.2f,position+facing*0.9f+hb::Vec3{0,0.2f,0.2f},Angle(facing),1.2f,false,(Swings&1)!=0);  // 번갈아 위·아래로 벰  // 캐릭터 그림과 따로, 공격 방향으로 돌린 베기
  const float minDot=std::cos(rules->SwordHalfAngle*3.14159265f/180),reach=rules->SwordRange+(Enchant==3?rules->SlashExtend:0);
  auto inFan=[&](const hb::Vec3& at,float radius){const auto d=at-position;const float len=Length(d);
    return len<=reach+radius&&(len<=radius+0.75f||hb::VectorMath::DotProduct(d*(1/len),facing)>=minDot);};  // 바로 붙은 적은 방향과 관계없이 맞음
  for(auto* e:enemies){const auto at=hb::Scene::GetPosition(e);if(!inFan(at,e->Boss?e->Radius:0))continue;
    HitEnemy(e,Normal(at-position,facing),WeaponDamage());}
  HitReturnGate(position,rules->DoorReach,1);
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
    const int in=fightingRoom>=0?fightingRoom:area;  // 싸우는 방(문이 잠김) 벽에 막힘
    bool wall=inDungeon&&in>=0&&!map.rooms[in].Inside(p,0.2f),hit=false;
    if(Returning&&returnRoom>=0&&map.Locked(returnRoom,returnDir)&&Length(map.DoorPosition(returnRoom,returnDir)-p)<1.5f){
      HitReturnGate(p,1.5f,Character==1?rules->ArrowDoorHits:1);wall=true;}
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
    const int in=fightingRoom>=0?fightingRoom:area;
    if(it->second<=0||(inDungeon&&in>=0&&!map.rooms[in].Inside(p,-0.5f))){Give(bulletPool,it->first);it=bullets.erase(it);}else ++it;  // 방 벽에서 사라짐
  }
}

// ---- 구역·장면 전환 ----------------------------------------------------------------

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
  run["taken"]=std::vector<std::string>(taken.begin(),taken.end());
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
  const hb::Json done=run.value("taken",hb::Json::array());
  for(auto& t:done)taken.insert(t.get<std::string>());
  if(run.contains("facing"))facing=hb::Vec3{run["facing"][0].get<float>(),run["facing"][1].get<float>(),0};
  return true;
}

void TopDownShooter::Leave(int to,const std::string& spawn){
  // 바닥에 남은 골드는 들고 간다. 전투 중엔 문이 잠겨 있어 적·탄 상태는 넘기지 않는다
  for(auto& [c,value]:coins){Gold+=value;Give(coinPool,c);}coins.clear();
  SaveRun();leaving=true;hb::Physics::SetVelocity(player,hb::Vec3{0,0,0});
  if(to<0)taken.clear();  // 던전은 들어갈 때마다 새로 만들어짐
  hb::Scene::Open(to>=0?rules->DungeonScene:rules->HubScene,spawn.empty()?hb::Json::object():hb::Json{{"spawn",spawn}});  // 던전은 C++가 시작 방에 세움
}

void TopDownShooter::Begin(){
  // 장면 첫 프레임: 이 장면의 구역(RoomInfo), 상호작용 대상, 카메라를 찾고 진행을 이어받는다
  started=true;Hp=MaxHp;
  rules=&fallbackRules;for(auto* a:hb::Scene::GetAllActorsOfClass("AuricRules"))if(auto* r=dynamic_cast<AuricRules*>(a))rules=r;
  for(auto* a:hb::Scene::GetAllActorsOfClass("RoomInfo"))if(auto* r=dynamic_cast<RoomInfo*>(a)){
    area=r->Index;roomKind=r->Kind;exitY=r->ExitY;inDungeon=r->Kind=="Dungeon";}
  for(auto* a:hb::Scene::GetAllActorsOfClass("Interactable"))if(auto* i=dynamic_cast<Interactable*>(a))interactables.push_back(i);
  auto cams=hb::Scene::GetActorsWithTag("MainCamera");camera=cams.empty()?nullptr:cams.front();
  const bool carried=LoadRun();
  if(!carried&&KeepProgress){const auto p=hb::Save::Read("Auric.progress");
    if(p.is_object()){Debt=p.value("debt",Debt);SofaLevel=p.value("sofa",SofaLevel);HomeLevel=p.value("home",HomeLevel);MaxHp=3+SofaLevel;Hp=MaxHp;}}
  if(carried||area>=0)Phase=std::max(Phase,2);  // 장면을 넘어왔거나 던전에서 바로 시작하면 로딩·타이틀 생략
  RoomIndex=area;
  if(inDungeon){Prewarm();StartFloor();}
  else if(Returning){Returning=false;ReturnSuccess=true;Settle();}  // 거점에 닿으면 귀환 성공
  Hud();
}

void TopDownShooter::StartFloor(){
  // 새 층: 데이터 에셋으로 방을 무작위로 잇고, 장면 풀로 바닥·벽·장식을 깐다. 플레이어는 시작 방 계단 아래에 선다
  const auto floor=hb::Data::Get(rules->FloorData);roomTable=hb::Data::Get(rules->RoomTable);
  map.Generate(Seed?unsigned(Seed):unsigned(std::rand()^(frame*7919)^int(hb::Game::GetSessionId().size()*131)),floor,roomTable);
  map.Build();
  // 채집방·상점의 상호작용 대상 자리 (장면에 화면 밖으로 놓아 둔 것을 옮김)
  for(auto* i:interactables){const bool gather=i->Kind=="Ore"||i->Kind=="Herb",shop=i->Kind=="Smith"||i->Kind=="Stall";if(!gather&&!shop)continue;
    for(auto& r:map.rooms)if(r.kind==(gather?"Gather":"Shop")){
      const float side=i->Kind=="Ore"||i->Kind=="Smith"?-1.f:1.f;
      hb::Scene::SetPosition(i,hb::Vec3{r.cx+side*(gather?1.6f:4.f),r.cy+(gather?1.2f:3.f),0.05f});break;}}
  const auto& s=map.rooms[map.start];area=map.start;roomKind=s.kind;RoomIndex=area;
  hb::Scene::SetPosition(player,hb::Vec3{s.cx,s.cy-1,0.1f});playerAt=hb::Scene::GetPosition(player);cameraReady=false;
  Layout=map.Describe().dump();
}

void TopDownShooter::Warp(int room){
  // 부스 운영자·검사용: 지나친 주 경로 방은 클리어로 치고 그 방 가운데로 옮긴다 (싸우던 적·탄은 치움)
  if(room<0)return;
  for(auto* e:Enemies())hb::Scene::Destroy(e);pending.clear();waveAlive=0;
  for(auto& [b,life]:bullets)life=0;
  if(fightingRoom>=0){map.Lock(fightingRoom,false);map.rooms[fightingRoom].state=2;fightingRoom=-1;}
  for(auto& r:map.rooms)if(r.path>=0&&r.path<map.rooms[room].path&&!Returning)r.state=2;
  const auto& r=map.rooms[room];hb::Scene::SetPosition(player,hb::Vec3{r.cx,r.cy,0.1f});
  playerAt=hb::Scene::GetPosition(player);cameraReady=false;Hud();
}

void TopDownShooter::EnterRoom(int room){
  // 방 가장자리에서 조금 들어오면 문이 잠기고, DT_Rooms의 웨이브가 하나씩 마법진 예고 뒤 나온다 (엔터 더 건전·소울 나이트)
  auto& r=map.rooms[room];if(r.state)return;
  if(r.kind!="Combat"&&r.kind!="Boss"){r.state=2;return;}  // 시작·채집·상점은 싸움 없음
  r.state=1;fightingRoom=room;map.Lock(room,true);
  const hb::Json row=roomTable.contains(r.row)?roomTable.at(r.row):hb::Json::object();
  waves.clear();std::stringstream ss(row.value("waves",std::string("S,S,S")));std::string w;while(std::getline(ss,w,'|'))if(!w.empty())waves.push_back(w);
  wave=0;monsterDrop=row.value("monsterDrop",false);
  if(!waves.empty())SpawnWave(waves[0],false);
  Hud();
}

void TopDownShooter::SpawnWave(const std::string& list,bool invulnerable){
  // 방 안 무작위 자리(플레이어·기둥에서 떨어진 곳)에 마법진을 띄우고 SpawnWarn초 뒤 적을 만든다
  const int room=fightingRoom>=0?fightingRoom:area;if(room<0)return;
  const auto& r=map.rooms[room];std::stringstream ss(list);std::string code;
  while(std::getline(ss,code,',')){
    std::string blueprint;for(const auto& entry:rules->Enemies){const auto eq=entry.find('=');if(eq!=std::string::npos&&entry.compare(0,eq,code)==0)blueprint=entry.substr(eq+1);}
    if(blueprint.empty())continue;
    hb::Vec3 at{r.cx,r.cy+2,0.1f};
    for(int tries=0;tries<30;++tries){
      const hb::Vec3 p{r.cx+(std::rand()%2001-1000)/1000.f*(r.hw-2.5f),r.cy+(std::rand()%2001-1000)/1000.f*(r.hh-2.5f),0.1f};
      bool bad=Length(p-playerAt)<4.5f;for(auto& q:r.blocked)bad=bad||Length(q-p)<1.6f;for(auto& o:pending)bad=bad||Length(o.at-p)<1.4f;
      if(!bad){at=p;break;}}
    if(code=="C")at=hb::Vec3{r.cx,r.cy+2,0.1f};  // 보스는 방 가운데 위
    PlayFx(rules->SpawnClip,rules->SpawnWarn,hb::Vec3{at.x,at.y-0.5f,0.02f},0,1.f,false);
    pending.push_back({at,blueprint,rules->SpawnWarn,invulnerable});
  }
}

void TopDownShooter::UpdateWaves(float delta){
  for(auto it=pending.begin();it!=pending.end();){
    if((it->left-=delta)>0){++it;continue;}
    hb::Transform t;t.position=it->at;
    if(auto* e=dynamic_cast<Enemy*>(hb::Scene::Spawn(it->blueprint,t))){
      if(!it->invulnerable)waveAlive++;
      if(it->invulnerable){e->Invulnerable=true;e->Stun(0.5f);}
      if(e->Boss){BossHp=e->MaxHp;Say("boss",e->DisplayName,"또 빚쟁이냐. 네 뼈도 황금으로 칠해 주마.");}}
    it=pending.erase(it);
  }
  if(fightingRoom<0||!pending.empty()||waveAlive>0||!Enemies().empty())return;
  if(++wave<waves.size())SpawnWave(waves[wave],false);else ClearRoom();
}

void TopDownShooter::ClearRoom(){
  // 방 클리어: 문이 열리고 피로도 +1 (기획), 피로도가 가득 차면 쓰러짐
  map.rooms[fightingRoom].state=2;map.Lock(fightingRoom,false);fightingRoom=-1;waves.clear();
  RoomClears++;Fatigue++;if(Fatigue>=FatigueMax){Hp=0;gameOver=rules->RespawnDelay;}Hud();
}

void TopDownShooter::StartReturnRoom(int room){
  // 귀환 페이즈 (기획서 6-3): 지나온 주 경로를 거꾸로. 방에 들어서면 무적 해골이 한꺼번에 나오고,
  // 시작 방 쪽 문은 10번 때려야 열린다. 들어설 때마다 피로도 +1 (보스방은 [귀환]을 쓴 자리라 적 없음)
  auto& r=map.rooms[room];if(r.returned||r.path<0)return;
  r.returned=true;DoorHits=0;returnRoom=-1;
  const int prev=map.PathRoom(r.path-1);
  for(int d=0;d<4;++d)if(prev>=0&&r.link[d]==prev){returnRoom=room;returnDir=d;map.Lock(room,true,d);}
  if(r.kind=="Boss")return;
  Fatigue++;if(Fatigue>=FatigueMax){Hp=0;gameOver=rules->RespawnDelay;}
  const hb::Json row=roomTable.contains("Return")?roomTable.at("Return"):hb::Json::object();
  SpawnWave(row.value("waves",std::string("S,S,M,M,M")),true);
}

void TopDownShooter::HitReturnGate(const hb::Vec3& at,float reach,int hits){
  // 귀환 중 잠긴 문 때리기: 10번이면 열리고 방의 적 전체 1초 경직
  if(!Returning||returnRoom<0||!map.Locked(returnRoom,returnDir)||Length(map.DoorPosition(returnRoom,returnDir)-at)>=reach)return;
  DoorHits+=hits;Sfx("DoorHit");
  if(DoorHits>=rules->DoorHitsToOpen){map.Lock(returnRoom,false,returnDir);StunAll(rules->DoorStun);Sfx("DoorOpen");}
  Hud();
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
  {// 선택 테두리는 고른 칸으로 옮기고, 설명 아이콘은 그림·크기를 바꿔 72px 칸 가운데에 (좌표: 제작 창 920x516 가운데 기준, tools/gen_hud.py)
   static const struct{const char* file;float w,h;}icons[]={{"craft_detail_potion.png",32,52},{"craft_item_flash.png",44,44},
     {"craft_item_crystal.png",30,42},{"craft_item_crystal.png",30,42},{"craft_item_crystal.png",30,42}};
   const auto& ic=icons[craftPick-1];const int col=(craftPick-1)%3,row=(craftPick-1)/3;
   hb::UI::SetVisible(player,"HUD","CraftSelect",craftOpen);hb::UI::SetVisible(player,"HUD","CraftDetail",craftOpen);
   hb::UI::SetPosition(player,"HUD","CraftSelect",hb::Vec2{32.f+116*col-460,128.f+116*row-258});
   hb::UI::SetTexture(player,"HUD","CraftDetail",std::string("Assets/UI/Kit/")+ic.file);
   hb::UI::SetSize(player,"HUD","CraftDetail",hb::Vec2{ic.w,ic.h});
   hb::UI::SetPosition(player,"HUD","CraftDetail",hb::Vec2{480+(72-ic.w)/2-460,176+(72-ic.h)/2-258});}
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
  // 버튼 그림: 캐릭터별 공격, 귀환 중엔 황금 침식(rot_*) 그림으로 바꿈
  static const char* themed[][3]={{"DodgeButton","btn_dodge","rot_dodge"},{"InteractButton","btn_interact","rot_interact"},{"CraftButton","btn_craft","rot_craft"},
    {"PauseButton","btn_pause","rot_pause"},{"BagButton","btn_inventory","rot_inventory"},{"Minimap","minimap","rot_minimap"}};
  const int theme=(rot?10:0)+Character;
  if(theme!=rotShown){rotShown=theme;
    for(auto& t:themed)hb::UI::SetTexture(player,"HUD",t[0],std::string("Assets/UI/Kit/")+t[rot?2:1]+".png");
    hb::UI::SetTexture(player,"HUD","AttackButton",std::string("Assets/UI/Kit/")+(rot?"rot_attack_":"btn_attack_")+faces[Character]+".png");}
  hb::UI::SetText(player,"HUD","HpText",std::to_string(hp)+" / "+std::to_string(MaxHp));
  hb::UI::SetText(player,"HUD","WeightText",std::to_string(Weight())+" / "+std::to_string(rules->WeightLimit));
  hb::UI::SetText(player,"HUD","GoldText",std::to_string(Gold)+" G   빚 "+std::to_string(Debt));
  hb::UI::SetText(player,"HUD","Hint",hint);
  hb::UI::SetValue(player,"HUD","Fatigue",FatigueMax>0?std::min(1.f,float(Fatigue)/FatigueMax):1.f);
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
  else if(moving){walkTime+=delta;next+="Walk_"+std::to_string(int(walkTime*10)%4);}
  else{walkTime=0;next+="Idle_0";}
  if(next!=currentSprite){currentSprite=next;if(Character<(int)rules->CharacterSprites.size())hb::Sprites::SetSprite(player,rules->CharacterSprites[Character]+next+".hbsprite.json");}
}

static size_t Utf8Count(const std::string& s){size_t n=0;for(unsigned char ch:s)n+=(ch&0xC0)!=0x80;return n;}
static std::string Utf8Prefix(const std::string& s,size_t chars){size_t i=0,n=0;
  while(i<s.size()){if(((unsigned char)s[i]&0xC0)!=0x80){if(n==chars)break;n++;}i++;}return s.substr(0,i);}

bool TopDownShooter::UpdateDialog(float delta,bool advance){
  // 대화창 (기획서 6-5): 한 글자씩 → E·클릭·Enter로 바로 다 보이기 → 다시 누르면 다음 줄
  static const char* parts[]={"DialogBox","DialogPortraitFrame","DialogName","DialogText","DialogNext","DialogTouch"};
  // 초상화 하나를 말하는 사람 그림으로 바꿔 120px 틀 가운데에 (좌표: 대화창 1000x170 기준, tools/gen_hud.py)
  static const struct{const char* who;float w,h;}portraits[]={{"collector",108,108},{"valen",96,96},{"sherry",84,66},{"alea",90,72},{"boss",66,66}};
  if(dialogIndex>=dialog.size()){
    if(!dialog.empty()){dialog.clear();dialogIndex=0;for(auto* n:parts)hb::UI::SetVisible(player,"HUD",n,false);
      hb::UI::SetVisible(player,"HUD","DialogPortrait",false);shownWho="";}
    return false;
  }
  const Line& l=dialog[dialogIndex];
  if(shownWho!=l.who){
    if(shownWho.empty())for(auto* n:parts)hb::UI::SetVisible(player,"HUD",n,true);
    for(const auto& p:portraits)if(l.who==p.who){
      hb::UI::SetTexture(player,"HUD","DialogPortrait",std::string("Assets/UI/Kit/portrait_")+p.who+".png");
      hb::UI::SetSize(player,"HUD","DialogPortrait",hb::Vec2{p.w,p.h});
      hb::UI::SetPosition(player,"HUD","DialogPortrait",hb::Vec2{26+(120-p.w)/2-500,25+(120-p.h)/2-194});}
    hb::UI::SetVisible(player,"HUD","DialogPortrait",true);
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
   if((Phase>=2||selecting)&&music!=currentMusic){hb::Audio::PlayMusic(music,0.5f);currentMusic=music;}}  // 첫 입력 전이면 엔진이 기다렸다 틂
  {// 부스 운영 (기획서 10장): F12 바로 처음으로, 60초 무입력이면 처음으로, 엔딩 카드에서 아무 키나 누르면 처음으로
   bool any=hb::VectorMath::Vector2Length(hb::Input::GetMouseDelta())>0;
   for(auto* k:{"w","a","s","d","e","q","space","enter","tab","LeftMouseButton","1","2","3","4","5"})any=any||hb::Input::IsKeyDown(k);
   const bool anyPressed=any&&!anyHeld;anyHeld=any;idleTime=any?0:idleTime+delta;
   if(hb::Input::IsKeyDown("F12")||(idleTime>=rules->IdleReset&&!(Phase<2&&!selecting))||(ending&&anyPressed)){ResetToTitle();return;}
   if(ending)return;
   if(Phase>=2&&!Returning&&!ReturnSuccess&&area>=0&&roomKind!="Boss"){runTime+=delta;
     if(runTime>=rules->RunNotice){if(hint.empty()){hint="10분이 지났어요 - F10을 누르면 보스방 앞으로";Hud();}
       if(hb::Input::IsKeyDown("F10")&&inDungeon){runTime=0;hint="";Warp(map.PathRoom(map.rooms[map.boss].path-1));}}}
   // 부스 운영자: F9로 주 경로 다음 방으로 (귀환 중이면 시작 방 쪽으로)
   const bool warp=hb::Input::IsKeyDown("F9");
   if(warp&&!warpHeld&&inDungeon&&area>=0){const int order=map.rooms[area].path+(Returning?-1:1);Warp(map.PathRoom(std::max(0,order)));}
   warpHeld=warp;}
  hb::Vec3 aim;const bool hasAim=hb::Input::GetMouseWorldPosition(hb::Vec3{0,0,1},position,aim);
  // 모바일 공격 버튼은 K. 터치 위치는 조준이 아니라서 자동 조준·바라보는 방향으로 카메라를 끈다
  touchMode=hb::Input::GetLastDevice()=="touch";  // 모바일 공격 버튼도 LeftMouseButton. 마지막 입력 장치로 자동 조준을 정함
  MoveCamera(position,touchMode?position+facing*(rules->CameraLeadMax/rules->CameraLead*0.5f):aim,(hasAim||touchMode)&&Phase>=2,delta);
  {const bool adv=hb::Input::IsKeyDown("e")||hb::Input::IsKeyDown("LeftMouseButton")||hb::Input::IsKeyDown("enter")||hb::Input::IsKeyDown("space");
   const bool pressed=adv&&!advanceHeld;advanceHeld=adv;
   if(frame>=2&&UpdateIntro(delta,pressed))return;
   if(UpdateDialog(delta,pressed)){flashHeld=true;dodgeHeld=true;attackCooldown=0.2f;hb::Physics::SetVelocity(player,hb::Vec3{0,0,0});return;}}  // 대화 중엔 행동·이동 막음
  if(!inDungeon){  // 거점 계단 끝 → 던전 (들어갈 때마다 새 층). 계단에 막 도착했으면 한 번 내려와야 다시 들어감 (W를 누른 채 왔다 갔다 방지)
    if(position.y<exitY-2)exitArmed=true;
    if(exitArmed&&position.y>exitY){Leave(0,"");return;}}
  else{
    // 시작 방 계단에 닿으면 거점으로 (귀환 중이면 귀환 성공)
    if(map.stairs&&fightingRoom<0&&Length(hb::Scene::GetPosition(map.stairs)-position)<1.0f){Leave(-1,"StairTop");return;}
    const int at=map.RoomAt(position);
    if(at>=0&&at!=area){area=at;RoomIndex=at;roomKind=map.rooms[at].kind;Hud();}
    if(at>=0&&map.rooms[at].Inside(position,rules->EnterDepth)){
      if(Returning)StartReturnRoom(at);else if(!ReturnSuccess)EnterRoom(at);}
  }

  std::vector<Enemy*> enemies;
  for(auto* e:Enemies()){e->Tick(delta);  // 적 이동은 여기서 한 번에 (상태 머신은 상태가 바뀔 때만 C++를 부름)
    if(e->burnedOut){e->burnedOut=false;KillEnemy(e);}else enemies.push_back(e);}  // 화상으로 쓰러짐
  boss=nullptr;for(auto* e:enemies)if(e->Boss)boss=e;  // 적 포인터는 프레임을 넘겨 들고 있지 않는다 (엔진이 다시 만들 수 있음)
  UpdateBullets(delta,position);
  UpdateFx(delta);
  if(inDungeon)UpdateWaves(delta);
  if(Hp<=0){  // 쓰러짐: 3초 뒤 회복 (ponytail: 정산 화면이 생기면 거기로)
    hb::Physics::SetVelocity(player,hb::Vec3{0,0,0});gameOver-=delta;
    for(auto& [b,life]:bullets)hb::Physics::SetVelocity(b,hb::Vec3{0,0,0});
    if(gameOver<=0){Hp=MaxHp;Fatigue=0;invulnerable=rules->InvulnerableTime*2;Hud();}
    return;
  }

  // 바라보는 방향: 걸을 땐 걷는 쪽(뒷걸음질 없음), 공격하는 동안(+0.4초)은 마우스 쪽, 모바일은 가까운 적이 있으면 그쪽
  const hb::Vec3 move{hb::Input::GetAxis("d")-hb::Input::GetAxis("a"),hb::Input::GetAxis("w")-hb::Input::GetAxis("s"),0};
  const bool moving=hb::VectorMath::VectorLengthSquared(move)>.01f;
  const bool attackDown=hb::Input::IsKeyDown("LeftMouseButton");
  aimHold=attackDown?0.4f:aimHold-delta;
  Enemy* target=nullptr;
  if(touchMode){float best=rules->AutoAimRange;
    for(auto* e:enemies){const float len=Length(hb::Scene::GetPosition(e)-position);if(len<best){best=len;target=e;}}}
  if(target)facing=Normal(hb::Scene::GetPosition(target)-position,facing);
  else if(aimHold>0&&hasAim&&!touchMode)facing=Normal(aim-position,facing);
  else if(moving)facing=hb::VectorMath::NormalizeVector(move);
  Animate(delta,moving);
  // 적재량 초과·피로도 75% 이상이면 이동속도 -25% (기획서 4-1)
  {const float speed=rules->MoveSpeed*((Weight()>rules->WeightLimit||Fatigue*4>=FatigueMax*3)?rules->SlowRate:1.f);
   if(speed!=sentSpeed){sentSpeed=speed;hb::Movement2D::SetSpeed(player,speed);}}
  attackCooldown-=delta;dodgeCooldownLeft-=delta;invulnerable-=delta;

  // 회피: Space를 누른 순간 바라보는 방향으로 대시, 대시 중 무적
  const bool dodgeDown=hb::Input::IsKeyDown("space")||hb::Input::IsKeyDown(" ");
  if(dodgeDown&&!dodgeHeld&&dodgeCooldownLeft<=0&&dodgeTimer<=0){dodgeTimer=rules->DodgeTime;dodgeCooldownLeft=rules->DodgeCooldown;Sfx("Dodge");}
  dodgeHeld=dodgeDown;
  if(dodgeTimer>0){dodgeTimer-=delta;hb::Physics::SetVelocity(player,facing*rules->DodgeSpeed);}

  // [귀환] 사용 (가방 Tab), 귀환 중 섬광탄 (E): 제작한 것 먼저, 없으면 골드
  const bool tab=hb::Input::IsKeyDown("tab");
  if(tab&&!returnHeld&&HasReturnItem&&!Returning&&!ReturnSuccess&&inDungeon&&area>=0){HasReturnItem=false;Returning=true;StartReturnRoom(area);Hud();
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
}
