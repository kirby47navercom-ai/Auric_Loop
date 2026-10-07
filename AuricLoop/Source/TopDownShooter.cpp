#include "TopDownShooter.h"
#include <random>
#include <map>
#include <cmath>
#include <string>
#include <algorithm>
#include <sstream>
#include <set>

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
  sentStunned=sentReady=sentNear=flipped=false;dashCount=0;phase2=false;sentVelocity={9e9f,0,0};
  tint=-1;Tint(false);
  if(Parked)return;  // 화면 밖 대기 중이면 상태 머신을 켜지 않음 (꺼낼 때 다시 Awake)
  hb::States::Start(this,Brain);brainRunning=true;
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
  if(flash>0&&(flash-=delta)<=0)Tint(false);
  if(burnLeft>0){burnLeft-=delta;if(!Invulnerable){Hp-=burnDamage*delta;burnedOut=Hp<=0.001f;}}
  // 상태 머신 파라미터·뒤집기는 바뀔 때만 보낸다 (적 수 × 매 프레임 명령을 줄임)
  const bool ready=KeepDistance>0&&(shotTimer-=delta)<=0,stunned=stun>0,flip=dir.x<0,near=distance<Radius+1.2f;
  if(ready!=sentReady){sentReady=ready;hb::States::SetBool(this,"Ready",ready);}
  if(near!=sentNear){sentNear=near;hb::States::SetBool(this,"Near",near);}  // 근거리 해골의 휘두르기 그림
  if(stunned!=sentStunned){sentStunned=stunned;hb::States::SetBool(this,"Stunned",stunned);}
  if(flip!=flipped){flipped=flip;hb::Sprites::SetFlip(this,flip,false);}
  const bool frozen=!game||game->Frozen();
  // 몸통 박치기: 맞히면 잠깐 물러남 (붙어서 무적이 끝나자마자 또 때리지 않게)
  if(!frozen&&stun<=0&&mode!=Mode::Jump&&distance<Radius+0.35f&&game->DamagePlayer(ContactDamage,hb::Scene::GetPosition(this))&&!Boss){
    Stun(0.6f);sentVelocity=dir*-4.f;hb::Physics::SetVelocity(this,sentVelocity);mode=Mode::Stagger;}
  if(mode==Mode::Dash||mode==Mode::Stagger||mode==Mode::Jump)return;  // 돌진·점프 속도·밀려남은 그대로 둔다
  hb::Vec3 v{0,0,0};
  if(!frozen&&stun<=0){
    if(mode==Mode::Chase)v=(detour>0?detourDir:dir)*Speed;
    else if(mode==Mode::Prowl){  // 보스: 플레이어 둘레 5m를 돌며 거리를 맞춤 (그냥 다가오기만 하지 않게)
      const hb::Vec3 side=Rotate(dir,ring%2?90.f:-90.f);v=hb::VectorMath::NormalizeVector(side+dir*std::clamp((distance-5)*0.5f,-1.f,1.f))*Speed;}
    else if(mode==Mode::Range){const float side=distance>KeepDistance+1?1.f:distance<KeepDistance-1?-1.f:0.f;v=dir*(Speed*side);}
  }
  if(Length(v-sentVelocity)>0.05f||++velocityAge>=10){sentVelocity=v;velocityAge=0;hb::Physics::SetVelocity(this,v);}  // 벽에 막혀 줄어든 속도도 가끔 다시 맞춘다
  // 막힘 확인 (0.2초마다): 가려는데 거의 못 움직였으면 0.7초 동안 왼쪽이나 오른쪽으로 비켜 돈다
  if(detour>0)detour-=delta;
  if(++stuckAge>=12){stuckAge=0;
    if(Length(v)>1&&detour<=0&&Length(hb::Physics::GetVelocity(this))<Length(v)*0.3f){detour=0.7f;detourDir=Rotate(dir,std::rand()%2?80.f:-80.f);}}
}

// 대기 중(화면 밖, 상태 머신 멈춤)이면 늦게 들어온 상태 이벤트는 무시
void Enemy::Halt(){if(Parked)return;mode=Mode::Halt;sentVelocity={0,0,0};hb::Physics::SetVelocity(this,hb::Vec3{0,0,0});}
void Enemy::Chase(){if(Parked)return;mode=Mode::Chase;Tint(false);}
void Enemy::Range(){if(Parked)return;mode=Mode::Range;}
void Enemy::Stagger(){if(Parked)return;mode=Mode::Stagger;}

void Enemy::Windup(){if(Parked)return;
  // 공격 예고: 멈추고 붉게. 보스는 돌진 방향을 정하고 붉은 예고선을 바닥에 그림
  Halt();float distance;dashDir=ToPlayer(distance);
  Tint(true);flash=0;
  if(Boss)if(auto* game=TopDownShooter::Current){game->Sfx("BossCharge");game->Warn(hb::Scene::GetPosition(this),dashDir,DashSpeed*0.45f+1,phase2?0.5f:0.8f);}
}

void Enemy::NextPattern(int next){pattern=next;hb::States::SetFloat(this,"Next",float(pattern));}

void Enemy::Prowl(){if(Parked)return;mode=Mode::Prowl;ring++;Tint(false);}

void Enemy::JumpWindup(){if(Parked)return;
  // 점프 준비: 웅크리고, 내려찍을 자리(지금 플레이어 자리)에 붉은 마법진
  Halt();jumpTarget=TopDownShooter::Current?TopDownShooter::Current->PlayerPosition():hb::Scene::GetPosition(this);
  if(auto* game=TopDownShooter::Current){game->Effect("Spawn",hb::Vec3{jumpTarget.x,jumpTarget.y-0.5f,0.02f},0,1.f);game->Sfx("BossCharge");}
}

void Enemy::Jump(){if(Parked)return;if(TopDownShooter::Current&&TopDownShooter::Current->Frozen()){Halt();return;}
  // 뛰어오름: 흙먼지, 0.6초에 착지 자리로 (공중에선 몸통 박치기 없음)
  mode=Mode::Jump;if(auto* game=TopDownShooter::Current)game->Effect("Dust",hb::Scene::GetPosition(this)+hb::Vec3{0,-1.2f,0});
  sentVelocity=(jumpTarget-hb::Scene::GetPosition(this))*(1/0.6f);sentVelocity.z=0;hb::Physics::SetVelocity(this,sentVelocity);
}

void Enemy::Slam(){if(Parked)return;
  Halt();
  if(auto* game=TopDownShooter::Current)game->BossSlam(hb::Scene::GetPosition(this),phase2?20:14,ShotSpeed*0.9f,ShotClip);
  NextPattern(3);
}

void Enemy::Fire(){if(Parked)return;
  Halt();Tint(false);
  auto* game=TopDownShooter::Current;if(!game||game->Frozen())return;
  float distance;const auto dir=ToPlayer(distance);
  game->FireBullets(hb::Scene::GetPosition(this),dir,ShotCount,ShotSpread,ShotSpeed,ShotClip);
  shotTimer=ShotInterval;
}

void Enemy::Dash(){if(Parked)return;if(TopDownShooter::Current&&TopDownShooter::Current->Frozen()){Halt();return;}
  mode=Mode::Dash;Tint(false);
  sentVelocity=dashDir*DashSpeed;hb::Physics::SetVelocity(this,sentVelocity);
  // 보스는 연속 돌진 (2번, 분노하면 3번) 뒤 다음 패턴
  const bool again=Boss&&++dashCount<(phase2?3:2);hb::States::SetBool(this,"Again",again);
  if(!again){dashCount=0;NextPattern(1);}
  if(auto* game=TopDownShooter::Current)game->Effect("Dust",hb::Scene::GetPosition(this)+hb::Vec3{0,-1,0});
}

void Enemy::Ring(){if(Parked)return;
  // 나선 탄막: 세 번 쏘며 매번 12도씩 돌려서 소용돌이처럼 (분노하면 더 촘촘히)
  Halt();auto* game=TopDownShooter::Current;
  if(game&&!game->Frozen())game->FireRing(hb::Scene::GetPosition(this),RingCount,ring*12.f,ShotSpeed,ShotClip);
  if(++ring%3==0)NextPattern(2);
}

void Enemy::Summon(){if(Parked)return;
  Halt();const auto at=hb::Scene::GetPosition(this);
  for(int i=0;i<SummonCount+(phase2?1:0);++i){hb::Transform t;t.position=at+hb::Vec3{i%2?2.5f:-2.5f,-1.5f-i/2,0};
    if(auto* game=TopDownShooter::Current)if(auto* e=game->SpawnEnemy(SummonBlueprint,t.position,false))e->Stun(0.5f);}
  NextPattern(0);
}

void Enemy::Stun(float seconds){stun=std::max(stun,seconds);sentVelocity={0,0,0};hb::Physics::SetVelocity(this,hb::Vec3{0,0,0});}

bool Enemy::TakeHit(float damage,const hb::Vec3& push,float stunSeconds,float burnSeconds){
  if(!Invulnerable){Hp-=damage;if(burnSeconds>0){burnLeft=burnSeconds;}}
  // 맞은 순간 하얗게 번쩍, 보스가 아니면 밀려나며 잠깐 경직(상태 머신이 맞는 그림)
  if(flash<=0){hb::Sprites::Flash(this,0.08f,Boss?0.45f:0.65f);flash=Boss?0.2f:0.1f;}  // 연타 중엔 번쩍임을 띄엄띄엄 (계속 하얗게 덮이지 않게)
  if(!Boss){stun=std::max(stun,stunSeconds);sentVelocity=push;hb::Physics::SetVelocity(this,sentVelocity);}
  else if(!phase2&&Hp<=MaxHp*0.5f&&Hp>0.001f){  // 보스 2페이즈: 체력 절반 아래면 분노 (빨라지고 탄이 늘어남)
    phase2=true;Speed*=1.25f;DashSpeed*=1.15f;RingCount+=4;if(auto* game=TopDownShooter::Current)game->BossEnraged(this);}
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
  // 엔터 더 건전·소울 나이트처럼 시작 방에서 격자 위로 가지를 뻗어 나무 모양으로 잇는다: 갈림길(최대 십자)과 막다른 방이 생기고,
  // 막다른 곳에 들어가면 왔던 길로 되돌아 나와야 한다. 가장 먼 막다른 방이 보스, 다른 막다른 방에 상점·채집.
  // 나머지는 전투방 (시작에서 멀수록 어려운 웨이브). 고리(loops)를 몇 개 더 이어 돌아가는 길도 만든다
  std::mt19937 rng(seed);
  auto pick=[&](int n){return std::uniform_int_distribution<int>(0,n-1)(rng);};
  const int count=std::max(6,int(floor.value("rooms",11.f)));
  const int loops=int(floor.value("loops",1.f));
  const float spacing=floor.value("spacing",36.f);
  std::map<std::pair<int,int>,int> cells;
  auto linkCount=[&](int i){int n=0;for(int d=0;d<4;++d)n+=rooms[i].link[d]>=0;return n;};
  auto freeDirs=[&](int i){std::vector<int> v;for(int d=0;d<4;++d)if(!cells.count({rooms[i].gx+dx[d],rooms[i].gy+dy[d]}))v.push_back(d);return v;};
  std::vector<int> dist;
  auto measure=[&](){  // 시작 방에서 몇 방 떨어졌는지 (너비 우선)
    dist.assign(rooms.size(),-1);dist[0]=0;std::vector<int> queue{0};
    for(size_t q=0;q<queue.size();++q)for(int d=0;d<4;++d){const int n=rooms[queue[q]].link[d];if(n>=0&&dist[n]<0){dist[n]=dist[queue[q]]+1;queue.push_back(n);}}};
  int shop=-1,gather=-1;
  for(int attempt=0;attempt<300;++attempt){
    rooms.clear();cells.clear();boss=shop=gather=-1;
    rooms.push_back(DungeonRoom{});cells[{0,0}]=0;
    while(int(rooms.size())<count){
      // 가지 끝(연결 1개)을 더 자주 골라 길게 뻗고, 가끔 중간 방에서 갈라짐 (3갈래 이상은 드물게)
      std::vector<int> grow;
      for(int i=0;i<int(rooms.size());++i){const int n=linkCount(i);if(freeDirs(i).empty())continue;
        grow.push_back(i);if(n<=1){grow.push_back(i);grow.push_back(i);}if(n>=3&&pick(3))grow.pop_back();}
      if(grow.empty())break;
      const int from=grow[pick(int(grow.size()))];const auto dirs=freeDirs(from);const int d=dirs[pick(int(dirs.size()))];
      DungeonRoom r;r.gx=rooms[from].gx+dx[d];r.gy=rooms[from].gy+dy[d];rooms.push_back(r);
      const int i=int(rooms.size())-1;cells[{r.gx,r.gy}]=i;rooms[from].link[d]=i;rooms[i].link[(d+2)%4]=from;
    }
    if(int(rooms.size())<count)continue;
    measure();
    std::vector<int> leaves;for(int i=1;i<int(rooms.size());++i)if(linkCount(i)==1)leaves.push_back(i);
    if(leaves.size()<3)continue;  // 보스·상점·채집 모두 막다른 방에
    std::sort(leaves.begin(),leaves.end(),[&](int x,int y){return dist[x]>dist[y];});
    if(dist[leaves[0]]<4)continue;  // 보스까지 최소 방 4개
    boss=leaves[0];const int rest=int(leaves.size())-1;const int s=1+pick(rest);shop=leaves[s];
    gather=leaves[1+(s-1+1+pick(rest-1))%rest];
    // 고리: 보스·상점·채집이 아닌 이웃 방끼리 몇 군데 더 이음 (돌아가는 길)
    std::vector<std::pair<int,int>> spots;
    for(int i=0;i<int(rooms.size());++i)for(int d:{0,1}){auto it=cells.find({rooms[i].gx+dx[d],rooms[i].gy+dy[d]});
      if(it==cells.end()||rooms[i].link[d]>=0)continue;const int j=it->second;
      if(i==boss||j==boss||i==shop||j==shop||i==gather||j==gather)continue;spots.push_back({i,d});}
    for(int k=0;k<loops&&!spots.empty();++k){const int x=pick(int(spots.size()));const auto [i,d]=spots[x];spots.erase(spots.begin()+x);
      const int j=cells[{rooms[i].gx+dx[d],rooms[i].gy+dy[d]}];rooms[i].link[d]=j;rooms[j].link[(d+2)%4]=i;}
    measure();if(dist[boss]<4)continue;  // 고리로 지름길이 생겨 보스가 가까워졌으면 다시
    break;
  }
  measure();
  // 주 경로 = 시작→보스 최단 경로 (귀환은 이 길을 거꾸로, F9는 이 순서로)
  for(int i=boss,steps=dist[boss];i>=0&&steps>=0;--steps){rooms[i].path=steps;int prev=-1;
    for(int d=0;d<4;++d){const int n=rooms[i].link[d];if(n>=0&&dist[n]==steps-1)prev=n;}i=prev;}
  for(int i=0;i<int(rooms.size());++i){
    auto& r=rooms[i];r.depth=dist[i];
    r.kind=i==0?"Start":i==boss?"Boss":i==shop?"Shop":i==gather?"Gather":"Combat";
    // 전투방 난이도: 시작에서 1방 Combat1, 2~3방 Combat2, 더 멀면 Combat3
    r.row=r.kind=="Combat"?(dist[i]<=1?"Combat1":dist[i]<=3?"Combat2":"Combat3"):r.kind;
    const hb::Json row=table.contains(r.row)?table.at(r.row):hb::Json::object();
    const int lo=int(row.value("minHalf",8.f)),hi=std::max(lo,int(row.value("maxHalf",10.f)));
    r.hw=float(lo+pick(hi-lo+1));r.hh=row.value("square",false)?r.hw:float(lo+pick(hi-lo+1));
    r.cx=r.gx*spacing;r.cy=r.gy*spacing;
    r.layout=r.kind=="Combat"?pick(6):r.kind=="Boss"?1:-1;  // 엄폐물 배치 (Build), 시작·상점·채집은 없음
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
// 반복 무늬 조각 하나를 사각형 [x0,x1]×[y0,y1]에 깐다. collider: 0 없음, 1 전체, 2 아래 1m (위로 솟은 벽면)
void Dungeon::Put(std::vector<Piece>& out,const char* tag,float x0,float y0,float x1,float y1,int collider,float z){
  if(x1-x0<0.05f||y1-y0<0.05f)return;
  auto& pool=pools[tag];if(pool.empty()){shortages++;return;}
  auto* a=pool.back();pool.pop_back();out.push_back({&pool,a});const float w=x1-x0,h=y1-y0;
  hb::Scene::SetPosition(a,hb::Vec3{(x0+x1)/2,(y0+y1)/2,z});hb::Sprites::SetSize(a,hb::Vec2{w,h});
  if(collider==1){hb::Components::SetVector(a,"BoxCollider2D","extent",hb::Vec3{w/2,h/2,0.5f});hb::Components::SetVector(a,"BoxCollider2D","center",hb::Vec3{0,0,0});}
  if(collider==2){hb::Components::SetVector(a,"BoxCollider2D","extent",hb::Vec3{w/2,0.5f,0.5f});hb::Components::SetVector(a,"BoxCollider2D","center",hb::Vec3{0,-h/2+0.5f,0});}
}

void Dungeon::Move(std::vector<Piece>& out,const char* tag,float x,float y,float z){
  auto& pool=pools[tag];if(pool.empty()){shortages++;return;}
  auto* a=pool.back();pool.pop_back();out.push_back({&pool,a});hb::Scene::SetPosition(a,hb::Vec3{x,y,z});
}

void Dungeon::Build(){
  // 풀: 장면에 화면 밖으로 세워 둔 조각들 (태그 Dungeon.*). 내 주변 방만 깔아서 개수가 적어도 됨
  for(auto* tag:{"Dungeon.Floor","Dungeon.Cap","Dungeon.Face","Dungeon.Arch","Dungeon.Torch","Dungeon.Glow","Dungeon.Banner","Dungeon.Pillar",
                 "Dungeon.Crate","Dungeon.Barrel","Dungeon.LowWall","Dungeon.Statue","Dungeon.Chest","Dungeon.Rubble","Dungeon.Bones","Dungeon.Gold"})
    pools[tag]=hb::Scene::GetActorsWithTag(tag);
  gateFree=hb::Scene::GetActorsWithTag("Dungeon.Gate");sideFree=hb::Scene::GetActorsWithTag("Dungeon.GateSide");
  {auto s=hb::Scene::GetActorsWithTag("Dungeon.Stairs");stairs=s.empty()?nullptr:s.front();}
  shortages=0;placed.clear();
  {// 맵 밖: 벽 윗면 무늬를 어둡게, 맵 전체 뒤에 한 장 (카메라가 밖을 비춰도 빈 화면이 안 보이게)
   float x0=1e9f,x1=-1e9f,y0=1e9f,y1=-1e9f;
   for(auto& r:rooms){x0=std::min(x0,r.cx-r.hw);x1=std::max(x1,r.cx+r.hw);y0=std::min(y0,r.cy-r.hh);y1=std::max(y1,r.cy+r.hh);}
   auto back=hb::Scene::GetActorsWithTag("Dungeon.Background");
   if(!back.empty()){hb::Scene::SetPosition(back[0],hb::Vec3{(x0+x1)/2,(y0+y1)/2,-1});hb::Sprites::SetSize(back[0],hb::Vec2{x1-x0+60,y1-y0+60});}}
  // 방마다 장식·엄폐물 자리를 한 번 정함 (방 번호로 씨앗을 줘서 다시 깔아도 같은 자리)
  const float C=CORRIDOR;
  for(int i=0;i<int(rooms.size());++i){
    auto& r=rooms[i];r.props.clear();r.blocked.clear();
    std::mt19937 rng(unsigned(i*7919+int(r.hw*31)+r.gx*17+r.gy*131));
    auto between=[&](float a,float b){return std::uniform_real_distribution<float>(a,b)(rng);};
    const float x0=r.cx-r.hw,x1=r.cx+r.hw,y0=r.cy-r.hh,y1=r.cy+r.hh;
    // 북쪽 벽 장식: 횃불·빛 (6m마다), 넓은 벽엔 깃발, 위 문엔 아치
    std::vector<std::pair<float,float>> north;
    if(r.link[0]<0)north.push_back({x0,x1});else{north.push_back({x0,r.cx-C});north.push_back({r.cx+C,x1});r.props.push_back({"Dungeon.Arch",r.cx,y1+1.5f});}
    for(auto [a,b]:north){for(float x=a+2.5f;x<b-1.5f;x+=6){r.props.push_back({"Dungeon.Torch",x,y1+1.1f});r.props.push_back({"Dungeon.Glow",x,y1+1.45f});}
      if(b-a>9)r.props.push_back({"Dungeon.Banner",(a+b)/2,y1+1.6f});}
    // 엄폐물 배치 (방마다 무작위 하나): 0 기둥 몇 개, 1 네 기둥, 2 가운데 상자 더미, 3 낮은 벽 두 줄(통로),
    // 4 상자·통 흩뿌리기, 5 네 귀퉁이 황금 석상 + 가운데 보물 상자. 문 앞 3.5m는 비워서 문을 막지 않음
    auto place=[&](const char* tag,float fx,float fy,float lift){
      const hb::Vec3 p{r.cx+fx,r.cy+fy,0};
      for(int d=0;d<4;++d)if(r.link[d]>=0&&std::hypot(DoorPosition(i,d).x-p.x,DoorPosition(i,d).y-p.y)<3.5f)return;
      if(!r.Inside(p,1.5f))return;
      for(auto& q:r.blocked)if(std::hypot(q.x-p.x,q.y-p.y)<1.2f)return;
      r.blocked.push_back(p);r.props.push_back({tag,p.x,p.y+lift});};
    const float W=r.hw,Hh=r.hh;
    switch(r.layout){
      case 0:{for(int k=0,n=int(between(1,3.99f));k<n;++k)place("Dungeon.Pillar",between(-W+3,W-3),between(-Hh+3,Hh-3),0.6f);}break;
      case 1:{for(float sx:{-1.f,1.f})for(float sy:{-1.f,1.f})place("Dungeon.Pillar",sx*W*0.5f,sy*Hh*0.5f,0.6f);}break;
      case 2:{for(float sx:{-0.9f,0.9f})for(float sy:{-0.7f,0.9f})place("Dungeon.Crate",sx,sy,0.7f);place("Dungeon.Barrel",2.4f,0.2f,0.5f);}break;
      case 3:{for(float sy:{-1.f,1.f})for(float x=-W*0.6f;x<=W*0.6f;x+=1.6f)if(std::fabs(x)>2.5f)place("Dungeon.LowWall",x,sy*Hh*0.4f,0.3f);}break;
      case 4:{for(int k=0;k<7;++k)place(k%2?"Dungeon.Barrel":"Dungeon.Crate",between(-W+2.5f,W-2.5f),between(-Hh+2.5f,Hh-2.5f),k%2?0.5f:0.7f);}break;
      case 5:{for(float sx:{-1.f,1.f})for(float sy:{-1.f,1.f})place("Dungeon.Statue",sx*(W-3),sy*(Hh-3),0.8f);place("Dungeon.Chest",0,0,0.4f);}break;
    }
    // 바닥 잔해·뼈, 보스·채집방엔 금화 더미
    for(int k=0,n=int(r.hw*r.hh/30);k<n;++k){const float x=between(x0+1,x1-1),y=between(y0+1,y1-1);
      if(std::fabs(x-r.cx)<2&&std::fabs(y-r.cy)<2)continue;
      r.props.push_back({(r.kind=="Boss"||r.kind=="Gather")&&k%3==0?"Dungeon.Gold":k%2?"Dungeon.Bones":"Dungeon.Rubble",x,y});}
  }
  if(stairs)hb::Scene::SetPosition(stairs,hb::Vec3{rooms[start].cx-rooms[start].hw+2.2f,rooms[start].cy+rooms[start].hh-1.6f,0.05f});  // 문(벽 가운데)을 막지 않게 왼쪽 위 구석
  Show(start);
}

void Dungeon::PlaceRoom(int i){
  auto& out=placed[i];auto& r=rooms[i];const float C=CORRIDOR,x0=r.cx-r.hw,x1=r.cx+r.hw,y0=r.cy-r.hh,y1=r.cy+r.hh;
  Put(out,"Dungeon.Floor",x0,y0,x1,y1,0,0.f);
  // 북쪽 벽: 위로 솟은 벽면 3m (아래 1m만 막힘), 남쪽 벽(윗면 1m), 서·동 벽(윗면, 북쪽 벽면 높이까지). 문 자리는 비움
  if(r.link[0]<0)Put(out,"Dungeon.Face",x0,y1,x1,y1+3,2,0.02f);else{Put(out,"Dungeon.Face",x0,y1,r.cx-C,y1+3,2,0.02f);Put(out,"Dungeon.Face",r.cx+C,y1,x1,y1+3,2,0.02f);}
  if(r.link[2]<0)Put(out,"Dungeon.Cap",x0-1,y0-1,x1+1,y0,1,0.03f);else{Put(out,"Dungeon.Cap",x0-1,y0-1,r.cx-C,y0,1,0.03f);Put(out,"Dungeon.Cap",r.cx+C,y0-1,x1+1,y0,1,0.03f);}
  for(int side:{3,1}){const float a=side==3?x0-1:x1,b=a+1;
    if(r.link[side]<0)Put(out,"Dungeon.Cap",a,y0,b,y1+3,1,0.03f);else{Put(out,"Dungeon.Cap",a,y0,b,r.cy-C,1,0.03f);Put(out,"Dungeon.Cap",a,r.cy+C,b,y1+3,1,0.03f);}}
  for(const auto& p:r.props)Move(out,p.tag,p.x,p.y);
}

void Dungeon::PlaceCorridor(int i,int d){
  // 북쪽(d 0)·동쪽(d 1) 복도만 단위로 둠 (반대쪽은 상대 방의 북·동 복도)
  auto& out=placed[1000+i*4+d];const auto& r=rooms[i];const float C=CORRIDOR;
  if(d==0){const auto& n=rooms[r.link[0]];const float bottom=r.cy+r.hh,top=n.cy-n.hh;
    Put(out,"Dungeon.Floor",r.cx-C,bottom,r.cx+C,top,0,0.f);Put(out,"Dungeon.Cap",r.cx-C-1,bottom,r.cx-C,top-1,1,0.03f);Put(out,"Dungeon.Cap",r.cx+C,bottom,r.cx+C+1,top-1,1,0.03f);}
  else{const auto& e=rooms[r.link[1]];const float left=r.cx+r.hw,right=e.cx-e.hw;
    Put(out,"Dungeon.Floor",left,r.cy-C,right,r.cy+C,0,0.f);Put(out,"Dungeon.Face",left+1,r.cy+C,right-1,r.cy+C+3,2,0.02f);Put(out,"Dungeon.Cap",left+1,r.cy-C-1,right-1,r.cy-C,1,0.03f);}
}

void Dungeon::Show(int center){
  // 지금 방과 이웃 방, 그 방들에 붙은 복도만 남기고 나머지 조각은 화면 밖 풀로 돌려놓는다
  std::set<int> near{center};for(int d=0;d<4;++d)if(rooms[center].link[d]>=0)near.insert(rooms[center].link[d]);
  std::set<int> want(near.begin(),near.end());
  for(int i=0;i<int(rooms.size());++i)for(int d:{0,1})if(rooms[i].link[d]>=0&&(near.count(i)||near.count(rooms[i].link[d])))want.insert(1000+i*4+d);
  for(auto it=placed.begin();it!=placed.end();)
    if(!want.count(it->first)){for(auto& p:it->second){hb::Scene::SetPosition(p.actor,hb::Vec3{0,-200,0});p.pool->push_back(p.actor);}it=placed.erase(it);}else ++it;
  for(int u:want)if(!placed.count(u)){if(u<1000)PlaceRoom(u);else PlaceCorridor((u-1000)/4,(u-1000)%4);}
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
  if(shortages)list.push_back({{"kind","Shortage"},{"count",shortages}});  // 조각 풀 부족 (tools/gen_scene.py 개수 늘리기)
  for(const auto& r:rooms)list.push_back({{"kind",r.kind},{"row",r.row},{"x",r.cx},{"y",r.cy},{"hw",r.hw},{"hh",r.hh},{"path",r.path},{"state",r.state},{"links",{r.link[0],r.link[1],r.link[2],r.link[3]}}});
  return list;
}

// =====================================================================================
// 게임 규칙
// =====================================================================================

std::vector<Enemy*> TopDownShooter::Enemies() const{
  std::vector<Enemy*> list;
  for(auto* a:hb::Scene::GetAllActorsOfClass("Enemy"))if(auto* e=dynamic_cast<Enemy*>(a))if(!e->Parked)list.push_back(e);
  return list;
}

// 적도 탄처럼 장면(Dungeon)에 화면 밖으로 세워 둔 것을 꺼내 쓴다 (태그 Enemy.S·M·C). Scene::Spawn은 한 마리에 수십 ms라 웨이브마다 끊김
Enemy* TopDownShooter::SpawnEnemy(const std::string& blueprint,const hb::Vec3& at,bool invulnerable){
  std::string code;for(const auto& entry:rules->Enemies){const auto eq=entry.find('=');if(eq!=std::string::npos&&entry.substr(eq+1)==blueprint)code=entry.substr(0,eq);}
  Enemy* e=nullptr;
  if(!code.empty())for(auto* a:hb::Scene::GetActorsWithTag("Enemy."+code))if(auto* p=dynamic_cast<Enemy*>(a))if(p->Parked){e=p;break;}
  if(e){hb::Transform t;t.position=at;hb::Scene::SetTransform(e,t);e->Parked=false;e->Invulnerable=invulnerable;e->Awake();}
  else{hb::Transform t;t.position=at;e=dynamic_cast<Enemy*>(hb::Scene::Spawn(blueprint,t));if(e)e->Invulnerable=invulnerable;}  // 모자랄 때만 (끊김 감수)
  return e;
}

void TopDownShooter::ParkEnemy(Enemy* e){
  const bool pooled=hb::Tags::Has(e,"Enemy.S",true)||hb::Tags::Has(e,"Enemy.M",true)||hb::Tags::Has(e,"Enemy.C",true);
  if(!pooled){hb::Scene::Destroy(e);return;}
  if(e->brainRunning){hb::States::Stop(e);e->brainRunning=false;}
  hb::Physics::SetVelocity(e,hb::Vec3{0,0,0});e->Parked=true;e->burnLeft=0;
  hb::Scene::SetPosition(e,hb::Vec3{-60.f+float(std::rand()%120),-300.f-float(std::rand()%20),0});
}

float TopDownShooter::WeaponDamage() const{
  const float base=Character==1?rules->ArrowDamage:Character==2?rules->BoltDamage:rules->SwordDamage;
  return base*(1+rules->UpgradeBonus*WeaponLevel)*(Enchant==1?1+rules->EnchantPower:1)*(Fatigue*4>=FatigueMax*3?rules->TiredAttack:1.f);  // 지치면 약해짐
}

bool TopDownShooter::DamagePlayer(int amount,const hb::Vec3& from){
  // 맞으면: 무적 시간 동안 깜빡임, 맞은 반대쪽으로 살짝 밀려남, 붉게 번쩍·화면 흔들림
  if(invulnerable>0||dodgeTimer>0||Hp<=0)return false;
  Hp-=amount;invulnerable=rules->InvulnerableTime;Sfx("Hurt");if(Hp<=0){Hp=0;gameOver=rules->RespawnDelay;}
  knock=Normal(playerAt-from,hb::Vec3{0,-1,0})*rules->HurtKnockback;knockTimer=0.12f;shake=rules->ShakeTime*2;
  Tip(2);hb::Sprites::Flash(player,0.15f,1.f);Effect("HurtClaw",hb::Vec3{playerAt.x,playerAt.y+0.6f,0.3f});
  hb::Camera::Flash(hb::Color{0.7f,0.05f,0.05f,0.3f},0.18f);Hud();
  return true;
}

// 적 탄 패턴 (엔진 탄막 시스템). 탄 그림은 클립 SA_<이름>의 첫 장 S_<이름>_0 한 장, 맞는 대상은 플레이어(무적이 아닐 때)·방 벽·발렌 베기
static hb::Json ShotPattern(const AuricRules* rules,const hb::Vec3& origin,int count,float speed,const std::string& clip){
  const std::string c=clip.empty()?rules->EnemyShotClip:clip;
  const auto a=c.rfind("SA_"),b=c.rfind(".hbspriteanimation");
  const std::string name=a==std::string::npos||b==std::string::npos||b<a?"EnemyOrb":c.substr(a+3,b-a-3);
  return {{"origin",{origin.x,origin.y,0.15f}},{"count",count},{"speed",speed},{"lifetime",rules->EnemyShotLife},{"radius",rules->EnemyShotRadius},
    {"size",name=="BossOrb"?0.63f:0.44f},{"plane","XY"},{"texture","Assets/Sprites/FX/S_"+name+"_0.hbsprite.json"},
    {"targetTags",{"Player.Hittable","Dungeon.Cap","Dungeon.Face","Dungeon.Gate","Dungeon.GateSide","ShotGuard"}}};
}

void TopDownShooter::FireBullets(const hb::Vec3& from,const hb::Vec3& dir,int count,float spread,float speed,const std::string& clip){
  auto p=ShotPattern(rules,from+dir*0.6f,count,speed,clip);
  p["mode"]=count>1?"fan":"aim";p["direction"]={dir.x,dir.y,0};p["spread"]=std::min(360.f,spread*(count-1));  // 우리 spread는 탄 사이 각도, 엔진은 전체 각도
  pendingShots.push_back(std::move(p));Shots+=count;
}

void TopDownShooter::FireRing(const hb::Vec3& from,int count,float angle,float speed,const std::string& clip){
  auto p=ShotPattern(rules,from,count,speed,clip);p["mode"]="circle";p["angle"]=angle;
  pendingShots.push_back(std::move(p));Shots+=count;
}

void TopDownShooter::DropCoin(const hb::Vec3& at,int value){
  hb::Transform t;t.position=hb::Vec3{at.x,at.y,0.05f};
  if(auto* c=Take(coinPool,rules->CoinPrefab,t)){coins[c]=value;hb::Sprites::PlayAnimation(c,rules->CoinClip,true);}else Gold+=value;
}

void TopDownShooter::StunAll(float seconds){for(auto* e:Enemies())e->Stun(seconds);}

// 탄·골드·베기 이펙트는 장면에 미리 놓아 두고(태그 Pool.*) 화면 밖에 세워 둔다. 꺼내기·돌려놓기는 옮기기만 한다.
// 실행 중 생성(Scene::Spawn)과 엔진 풀(ActorPool)은 부를 때마다 컴포넌트를 다시 시작해 수 ms~수십 ms가 걸려 프레임이 끊긴다

hb::Actor* TopDownShooter::Take(std::vector<hb::Actor*>& pool,const std::string& prefab,const hb::Transform& at){
  if(!pool.empty()){auto* a=pool.back();pool.pop_back();hb::Scene::SetTransform(a,at);return a;}
  (void)prefab;return nullptr;  // 다 쓰고 있으면 이번 것은 건너뛴다. 게임 중 새로 만들면(Spawn) 에디터에서 하나에 수백 ms씩 멈춤
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

void TopDownShooter::Effect(const std::string& name,const hb::Vec3& at,float angle,float glow,bool flip){
  static const std::map<std::string,float> length={{"Dust",0.24f},{"BoneBurst",0.24f},{"Shockwave",0.26f},{"Muzzle",0.12f},{"CardCast",0.15f},
    {"HurtClaw",0.15f},{"CoinSparkle",0.18f},{"Spawn",0.9f},{"Hit",0.16f}};
  const auto it=length.find(name);
  PlayFx("Assets/Animations/SA_"+name+".hbspriteanimation.json",it!=length.end()?it->second:0.3f,at,angle,glow,flip);
}

void TopDownShooter::Warn(const hb::Vec3& from,const hb::Vec3& dir,float length,float seconds){
  // 돌진 예고선: 장면에 놓아 둔 붉은 띠(Pool.Warn)를 돌진 방향으로 돌려 길이만큼 깔았다가 치움
  if(warnPool.empty())return;auto* a=warnPool.back();warnPool.pop_back();
  hb::Transform t;t.position=from+dir*(length/2);t.position.z=0.02f;t.rotation=hb::Vec3{0,0,Angle(dir)};hb::Scene::SetTransform(a,t);
  hb::Sprites::SetSize(a,hb::Vec2{length,1.4f});warns.push_back({a,seconds});
}

void TopDownShooter::BossSlam(const hb::Vec3& at,int count,float speed,const std::string& clip){
  // 내려찍기: 충격파·흙먼지, 원형 탄, 크게 흔들림. 가까이 있으면 맞음
  Effect("Shockwave",hb::Vec3{at.x,at.y-0.8f,0.03f},0,0.4f);Effect("Dust",hb::Vec3{at.x-1,at.y-1,0.03f});Effect("Dust",hb::Vec3{at.x+1,at.y-1,0.03f},0,0,true);
  shake=0.45f;Sfx("Boom");
  FireRing(at,count,0,speed,clip);
  if(Length(playerAt-at)<3.0f)DamagePlayer(1,at);
}

void TopDownShooter::BossEnraged(Enemy* e){
  // 2페이즈: 포효(흔들림·붉은 번쩍), 자막
  shake=0.6f;hb::Camera::Flash(hb::Color{0.8f,0.1f,0.05f,0.45f},0.5f);Sfx("BossCharge");
  UiText("BossSub",e->DisplayName+"이(가) 분노했다!");UiVisible("BossSub",true);bannerTime=1.8f;
}

void TopDownShooter::UpdateFx(float delta){
  for(auto it=warns.begin();it!=warns.end();)
    if((it->left-=delta)<=0){hb::Scene::SetPosition(it->actor,hb::Vec3{0,-200,0});warnPool.push_back(it->actor);it=warns.erase(it);}else ++it;
  for(auto it=fxs.begin();it!=fxs.end();)
    if((it->left-=delta)<=0){Give(fxPool,it->actor);it=fxs.erase(it);}else ++it;
}

void TopDownShooter::Prewarm(){
  bulletPool=hb::Scene::GetActorsWithTag("Pool.EnemyShot");
  shotPool=hb::Scene::GetActorsWithTag("Pool.PlayerShot");
  // 발렌 베기용 탄 지우개: 플레이어 탄 하나를 빌려 투명하게 (투명도는 렌더 재질을 다시 만들어서 로딩 중 한 번만)
  if(!shotGuard&&!shotPool.empty()){shotGuard=shotPool.back();shotPool.pop_back();hb::Tags::Add(shotGuard,"ShotGuard");
    hb::Sprites::SetColor(shotGuard,hb::Color{1,1,1,0});hb::Scene::SetPosition(shotGuard,hb::Vec3{-500,-500,0});}
  coinPool=hb::Scene::GetActorsWithTag("Pool.Coin");
  fxPool=hb::Scene::GetActorsWithTag("Pool.Fx");warnPool=hb::Scene::GetActorsWithTag("Pool.Warn");
  for(auto* tag:{"Enemy.S","Enemy.M","Enemy.C"})for(auto* a:hb::Scene::GetActorsWithTag(tag))if(auto* e=dynamic_cast<Enemy*>(a))ParkEnemy(e);
}

void TopDownShooter::KillEnemy(Enemy* e){
  const auto at=hb::Scene::GetPosition(e);Kills++;Sfx("Kill");if(waveAlive>0)waveAlive--;
  DropCoin(at,e->GoldMin+Kills%std::max(1,e->GoldMax-e->GoldMin+1));
  if(e->Boss){HasReturnItem=true;Monster++;boss=nullptr;BossHp=0;Hud();Tip(7);}
  if(monsterDrop&&fightingRoom>=0&&pending.empty()&&wave+1>=waves.size()&&Enemies().size()<=1){Monster++;Tip(5);}  // 이 방 마지막 해골은 마물 소재 확정
  PlayFx(e->DeathClip,0.9f,at,0,0,e->Flipped());  // 쓰러지는 그림은 이펙트로 (적은 바로 화면 밖 대기로)
  Effect("BoneBurst",hb::Vec3{at.x,at.y+0.2f,0.3f});shake=std::max(shake,rules->ShakeTime*1.5f);
  ParkEnemy(e);
}

bool TopDownShooter::HitEnemy(Enemy* e,const hb::Vec3& push,float damage){
  Hits++;Sfx("Hit");
  const bool crit=std::rand()%10000<int(rules->CritChance*100);  // 크리티컬: 피해 2배, 불꽃 두 겹·크게 흔들림
  if(crit){damage*=rules->CritDamage;const auto c=hb::Scene::GetPosition(e);Effect("Hit",hb::Vec3{c.x,c.y+0.4f,0.31f},45,2.f);shake=rules->ShakeTime*3;}
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
  PlayFx(rules->SlashClip,0.2f,position+facing*0.9f+hb::Vec3{0,0.2f,0.2f},Angle(facing),0.5f,false,(Swings&1)!=0);  // 번갈아 위·아래로 벰  // 캐릭터 그림과 따로, 공격 방향으로 돌린 베기
  const float minDot=std::cos(rules->SwordHalfAngle*3.14159265f/180),reach=rules->SwordRange+(Enchant==3?rules->SlashExtend:0);
  auto inFan=[&](const hb::Vec3& at,float radius){const auto d=at-position;const float len=Length(d);
    return len<=reach+radius&&(len<=radius+0.75f||hb::VectorMath::DotProduct(d*(1/len),facing)>=minDot);};  // 바로 붙은 적은 방향과 관계없이 맞음
  for(auto* e:enemies){const auto at=hb::Scene::GetPosition(e);if(!inFan(at,e->Boss?e->Radius:0))continue;
    HitEnemy(e,Normal(at-position,facing),WeaponDamage());}
  HitReturnGate(position,rules->DoorReach,1);
  // 앞쪽 부채꼴을 덮는 투명 상자를 잠깐 놓아 그 안의 적 탄을 지운다 (탄막 시스템이 상자를 맞은 것으로 치고 없앰)
  if(shotGuard){hb::Transform t;t.position=position+facing*(reach*0.5f);t.position.z=0.15f;t.rotation=hb::Vec3{0,0,Angle(facing)};
    t.scale=hb::Vec3{(reach*0.5f+0.3f)/0.07f,(reach*0.75f)/0.07f,1};hb::Scene::SetTransform(shotGuard,t);guardTime=0.12f;}
}

void TopDownShooter::Shoot(const hb::Vec3& from){
  hb::Transform t;t.position=from+facing*0.8f;t.position.z=0.2f;t.rotation=hb::Vec3{0,0,Angle(facing)};
  auto* s=Take(shotPool,rules->PlayerShotPrefab,t);if(!s)return;
  hb::Sprites::PlayAnimation(s,Character==1?rules->ArrowClip:rules->CardClip,true);
  Effect(Character==1?"Muzzle":"CardCast",from+facing*1.0f+hb::Vec3{0,0.3f,0.25f},Angle(facing),1.f);Sfx(Character==1?"Arrow":"Bolt");
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
    hb::Physics::SetVelocity(s,hb::Vec3{0,0,0});hb::Sprites::PlayAnimation(s,rules->BoomClip,false);Sfx("Boom");shotBoom[s]=true;life=0.25f;
    for(auto* e:Enemies()){const auto d=hb::Scene::GetPosition(e)-p;const float len=Length(d);
      if(len<rules->BoomRadius&&len>0.05f)HitEnemy(e,d*(1/len),rules->BoomDamage*WeaponDamage()/rules->BoltDamage);}
  }
  for(auto* s:done){Give(shotPool,s);shots.erase(s);shotBoom.erase(s);}
}

void TopDownShooter::UpdateBullets(float delta,const hb::Vec3& position){
  (void)position;
  for(const auto& p:pendingShots)hb::Projectiles::Fire(p);
  pendingShots.clear();
  // 구르기·무적 중엔 플레이어 태그를 빼서 탄이 지나가게
  const bool hittable=Hp>0&&invulnerable<=0&&dodgeTimer<=0;
  if(hittable!=playerHittable){playerHittable=hittable;if(hittable)hb::Tags::Add(player,"Player.Hittable");else hb::Tags::Remove(player,"Player.Hittable");}
  for(const auto& h:hb::Projectiles::TakeHits())
    if(h.value("target","")=="Player"&&!Frozen()){const auto& at=h["position"];DamagePlayer(1,hb::Vec3{at[0].get<float>(),at[1].get<float>(),0});}
  if(guardTime>0&&(guardTime-=delta)<=0)hb::Scene::SetPosition(shotGuard,hb::Vec3{-500,-500,0});
}

// ---- 구역·장면 전환 ----------------------------------------------------------------

#define AURIC_RUN_INTS(X) X(TipsShown) X(FatigueMax) X(Fatigue) X(Hp) X(MaxHp) X(Kills) X(RoomClears) X(Swings) X(Hits) X(Shots) X(Flashbangs) X(Gold) X(Ore) X(Herb) \
  X(Monster) X(Bottle) X(WeaponLevel) X(Debt) X(LastRepaid) X(Enchant) X(Crafted) X(SofaLevel) X(HomeLevel) X(Phase) X(Character)
#define AURIC_RUN_BOOLS(X) X(HasReturnItem) X(Returning) X(ReturnSuccess) X(KnockedOut) X(gatherTold)

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
  std::string scene=to>=0?rules->DungeonScene:rules->HubScene;
  if(to==-2){scene=rules->HomeScene;const auto at=scene.find('#');if(at!=std::string::npos)scene.replace(at,1,std::to_string(std::clamp(HomeLevel,1,2)));}
  hb::Scene::Open(scene,spawn.empty()?hb::Json::object():hb::Json{{"spawn",spawn}});  // 던전은 C++가 시작 방에 세움
}

void TopDownShooter::Begin(){
  // 장면 첫 프레임: 이 장면의 구역(RoomInfo), 상호작용 대상, 카메라를 찾고 진행을 이어받는다
  started=true;Hp=MaxHp;
  rules=&fallbackRules;for(auto* a:hb::Scene::GetAllActorsOfClass("AuricRules"))if(auto* r=dynamic_cast<AuricRules*>(a))rules=r;
  Lines("");  // 대사표 미리 읽기 (로딩 화면 동안)
  for(auto* a:hb::Scene::GetAllActorsOfClass("RoomInfo"))if(auto* r=dynamic_cast<RoomInfo*>(a)){
    area=r->Index;roomKind=r->Kind;exitY=r->ExitY;inDungeon=r->Kind=="Dungeon";inHome=r->Kind=="Home";}
  for(auto* a:hb::Scene::GetAllActorsOfClass("Interactable"))if(auto* i=dynamic_cast<Interactable*>(a))interactables.push_back(i);
  auto cams=hb::Scene::GetActorsWithTag("MainCamera");camera=cams.empty()?nullptr:cams.front();
  const bool carried=LoadRun();
  if(!carried&&KeepProgress){const auto p=hb::Save::Read("Auric.progress");
    if(p.is_object()){Debt=p.value("debt",Debt);SofaLevel=p.value("sofa",SofaLevel);HomeLevel=p.value("home",HomeLevel);MaxHp=3+SofaLevel;Hp=MaxHp;}}
  if(carried||area>=0)Phase=std::max(Phase,2);  // 장면을 넘어왔거나 던전에서 바로 시작하면 로딩·타이틀 생략
  RoomIndex=area;
  if(inDungeon){Prewarm();StartFloor();}
  if(inHome)ShowSofa();
  else if(Returning||KnockedOut){Returning=false;ReturnSuccess=true;Settle();}  // 거점에 닿으면 귀환 성공 (쓰러졌으면 소재 없이 정산)
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
  auto& first=map.rooms[map.start];first.visited=first.seen=true;for(int d=0;d<4;++d)if(first.link[d]>=0)map.rooms[first.link[d]].seen=true;
  minimapDirty=true;
  if(!StartRoom.empty())for(int i=0;i<int(map.rooms.size());++i)if(map.rooms[i].kind==StartRoom){Warp(i);break;}
}

void TopDownShooter::UpdateMinimap(){
  // HUD 오른쪽 위 미니맵 틀(160x128) 안: 격자 칸마다 방 칸, 이어진 방 사이에 복도 막대. 그림은 Assets/UI/Map
  if(!inDungeon||frame<2)return;
  int minx=1<<20,maxx=-(1<<20),miny=1<<20,maxy=-(1<<20);
  for(auto& r:map.rooms){minx=std::min(minx,r.gx);maxx=std::max(maxx,r.gx);miny=std::min(miny,r.gy);maxy=std::max(maxy,r.gy);}
  const float cell=std::min({22.f,144.f/(maxx-minx+1),108.f/(maxy-miny+1)});
  const float left=-176+(144-cell*(maxx-minx+1))/2,top=118+(108-cell*(maxy-miny+1))/2,box=cell*0.64f,bar=std::max(2.f,cell*0.18f);
  auto at=[&](const DungeonRoom& r){return hb::Vec2{left+(r.gx-minx+0.5f)*cell,top+(maxy-r.gy+0.5f)*cell};};
  // 자리·크기는 층을 시작할 때 모든 방·복도에 한 번 정해 두고(HUD 호출 캐시가 같은 값은 거름), 방을 옮길 땐 보이기·그림만 바뀐다
  int links=0;
  for(int i=0;i<int(map.rooms.size())&&i<16;++i){
    const auto& r=map.rooms[i];const auto name="MapRoom"+std::to_string(i);const auto c=at(r);
    UiPosition(name,hb::Vec2{c.x-box/2,c.y-box/2});UiSize(name,hb::Vec2{box,box});UiVisible(name,r.seen);
    if(r.seen)UiTexture(name,"Assets/UI/Map/map_"+std::string(i==area?"current":!r.visited?"unknown":r.kind=="Boss"?"boss":r.kind=="Shop"?"shop":r.kind=="Gather"?"gather":r.kind=="Start"?"start":"room")+".png");
    for(int d:{0,1}){const int j=r.link[d];if(j<0||links>=20)continue;
      const auto o=at(map.rooms[j]);const auto lname="MapLink"+std::to_string(links++);
      if(d==0)UiPosition(lname,hb::Vec2{c.x-bar/2,o.y}),UiSize(lname,hb::Vec2{bar,c.y-o.y});
      else UiPosition(lname,hb::Vec2{c.x,c.y-bar/2}),UiSize(lname,hb::Vec2{o.x-c.x,bar});
      UiVisible(lname,r.seen&&map.rooms[j].seen);}
  }
  for(int k=links;k<20;++k)UiVisible("MapLink"+std::to_string(k),false);
}

void TopDownShooter::ShowSofa(){
  // 원룸 소파 그림을 레벨에 맞게 (낡은 소파 → 가죽 → 황금 벨벳)
  if(rules->SofaSprites.empty())return;
  const auto& path=rules->SofaSprites[std::min<size_t>(SofaLevel,rules->SofaSprites.size()-1)];
  for(auto* i:interactables)if(i->Kind=="Sofa")hb::Sprites::SetSprite(i,path);
}

void TopDownShooter::Warp(int room){
  // 부스 운영자·검사용: 지나친 주 경로 방은 클리어로 치고 그 방 가운데로 옮긴다 (싸우던 적·탄은 치움)
  if(room<0)return;
  for(auto* e:Enemies())ParkEnemy(e);pending.clear();waveAlive=0;
  ClearBullets();
  if(fightingRoom>=0){map.Lock(fightingRoom,false);map.rooms[fightingRoom].state=2;fightingRoom=-1;}
  for(auto& r:map.rooms)if(r.path>=0&&r.path<map.rooms[room].path&&!Returning)r.state=2;
  const auto& r=map.rooms[room];const bool fight=(r.kind=="Boss"||r.kind=="Combat")&&!Returning;
  hb::Scene::SetPosition(player,hb::Vec3{r.cx,fight?r.cy-r.hh+rules->EnterDepth+1:r.cy,0.1f});  // 싸우는 방은 아래쪽 (가운데엔 엄폐물·보스)
  playerAt=hb::Scene::GetPosition(player);cameraReady=false;Hud();
}

void TopDownShooter::EnterRoom(int room){
  // 방 가장자리에서 조금 들어오면 문이 잠기고, DT_Rooms의 웨이브가 하나씩 마법진 예고 뒤 나온다 (엔터 더 건전·소울 나이트)
  auto& r=map.rooms[room];if(r.state)return;
  if(r.kind!="Combat"&&r.kind!="Boss"){r.state=2;if(r.kind=="Gather")Tip(4);if(r.kind=="Shop")Tip(6);return;}  // 시작·채집·상점은 싸움 없음
  r.state=1;fightingRoom=room;map.Lock(room,true);Tip(1);
  if(r.kind=="Boss"){cutscene=3.2f;cutsceneAt=hb::Vec3{r.cx,r.cy+2,0};roared=false;bannerTime=0;  // 보스 등장 컷신: 화면 위아래 검은 띠, 카메라가 보스 쪽으로
    for(auto* n:{"CineTop","CineBottom"})UiVisible(n,true);}
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
    if(auto* e=SpawnEnemy(it->blueprint,it->at,it->invulnerable)){
      if(!it->invulnerable)waveAlive++;
      if(it->invulnerable)e->Stun(0.5f);
      if(e->Boss){BossHp=e->MaxHp;roared=false;}}
    it=pending.erase(it);
  }
  if(fightingRoom<0||!pending.empty()||waveAlive>0||!Enemies().empty())return;
  if(++wave<waves.size())SpawnWave(waves[wave],false);else ClearRoom();
}

void TopDownShooter::ClearRoom(){
  // 방 클리어: 문이 열리고 피로도 +1 (기획), 피로도가 가득 차면 쓰러짐
  const int fightingRoomCleared=fightingRoom;
  map.rooms[fightingRoom].state=2;map.Lock(fightingRoom,false);fightingRoom=-1;waves.clear();
  // 피로도 (기획서 4-1): 방 클리어 +1, 보스 +2, 무게가 넘치면 +1 더
  const bool bossRoom=map.rooms[fightingRoomCleared].kind=="Boss";
  RoomClears++;Fatigue+=1+(bossRoom?1:0)+(Weight()>rules->WeightLimit?1:0);if(Fatigue>=FatigueMax){Hp=0;gameOver=rules->RespawnDelay;}Hud();
  if(RoomClears>=1&&!(TipsShown&(1<<7)))Tip(3);
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
  // 정산 (기획서 6-4): 소재를 골드로 바꾸고 일부를 빚에서 자동 상환, 강화는 초기화. 화면에 줄마다 보여 주고 남은 빚이 줄어드는 연출
  auto line=[](const std::string& name,int count,int price){return name+"  "+std::to_string(count)+" x "+std::to_string(price)+" G  =  "+std::to_string(count*price)+" G";};
  const int total=Gold+Ore*rules->OrePrice+Herb*rules->HerbPrice+Monster*rules->MonsterPrice;
  settleRows.clear();
  settleRows.push_back(line("광물",Ore,rules->OrePrice));settleRows.push_back(line("약초",Herb,rules->HerbPrice));
  settleRows.push_back(line("마물 소재",Monster,rules->MonsterPrice));settleRows.push_back("주운 골드  "+std::to_string(Gold)+" G");
  settleRows.push_back("합계  "+std::to_string(total)+" G");
  LastRepaid=int(total*rules->RepayRate);debtFrom=Debt;Debt=std::max(0,Debt-LastRepaid);debtTo=Debt;
  settleRows.push_back("빚 자동 상환 ("+std::to_string(int(rules->RepayRate*100+0.5f))+"%)  - "+std::to_string(LastRepaid)+" G");
  settleRows.push_back("내 몫  "+std::to_string(total-LastRepaid)+" G");
  Gold=total-LastRepaid;Ore=Herb=Monster=0;WeaponLevel=0;Enchant=0;
  settleTime=0;settleShown=0;debtShown=-1;settleDone=false;
  SaveRun();Hud();
}

void TopDownShooter::ShowSettle(bool visible){
  for(auto* n:{"SettleBack","SettlePanel","SettleTitle","SettleDebt","SettleNote","SettleHint"})UiVisible(n,visible);
  for(int i=0;i<7;++i)UiVisible("SettleRow"+std::to_string(i),visible&&i<settleShown);
}

bool TopDownShooter::UpdateSettle(float delta,bool advance){
  if(settleTime<0||frame<2)return settleTime>=0;
  if(settleTime==0){
    UiText("SettleTitle",KnockedOut?"정산 - 빈손으로 끌려 나왔다":"정산 - 귀환 성공");
    UiText("SettleNote",KnockedOut?"쓰러져서 소재를 잃었다. 무기 강화·각인도 초기화":"무기 강화·각인은 던전 밖에서 초기화된다");
    for(int i=0;i<7;++i)UiText("SettleRow"+std::to_string(i),i<int(settleRows.size())?settleRows[i]:"");
    settleShown=0;ShowSettle(true);}
  settleTime+=delta;
  // 0.3초마다 한 줄, 다 나오면 남은 빚이 1.2초 동안 줄어듦
  const int rows=std::min(int(settleRows.size()),int(settleTime/0.3f));
  if(rows!=settleShown){settleShown=rows;ShowSettle(true);Sfx("Coin");}
  const float t=std::clamp((settleTime-0.3f*settleRows.size())/1.2f,0.f,1.f);
  const int shown=debtFrom+int((debtTo-debtFrom)*t);
  if(shown!=debtShown){debtShown=shown;UiText("SettleDebt",std::string(koreanNames[Character])+"의 남은 빚  "+std::to_string(shown)+" G");}
  if(t>=1&&!settleDone){settleDone=true;UiVisible("SettleHint",true);}
  UiVisible("SettleHint",settleDone);
  if(advance){
    if(!settleDone){settleTime=0.3f*settleRows.size()+1.2f;return true;}  // 누르면 연출 건너뛰기
    settleTime=-1;ShowSettle(false);Talk("Settle",{{"debt",std::to_string(Debt)}});KnockedOut=false;Hud();return false;}
  return true;
}

void TopDownShooter::ShowEnding(){
  ending=true;anyHeld=true;hb::Physics::SetVelocity(player,hb::Vec3{0,0,0});
  UiText("EndingText",std::string(koreanNames[Character])+"의 남은 빚 "+std::to_string(Debt)+" G   ·   오늘 갚은 돈 "+std::to_string(LastRepaid)+" G");
  for(auto* n:{"EndingBack","EndingArt","EndingShade","EndingTitle","EndingText","EndingHint"})UiVisible(n,true);
}

void TopDownShooter::ResetToTitle(){
  // 처음부터: GameInstance를 새로 만들고 거점을 다시 연다 (부스 F12·무입력·엔딩)
  leaving=true;hb::Game::Reset();  // 새 세션으로 시작 장면(거점)부터
}

void TopDownShooter::Tip(int id){
  if(TipsShown&(1<<id)||!player||frame<2)return;TipsShown|=1<<id;
  std::string text;
  for(const auto& row:{std::string(touchMode?"TipTouch":"Tip")+std::to_string(id),"Tip"+std::to_string(id)}){
    const auto lines=Lines(row);if(!lines.empty()){text=lines[0].value("text",std::string(""));break;}}
  if(text.empty())return;
  UiText("Tip",text);UiVisible("TipBack",true);UiVisible("Tip",true);tipTime=5;Sfx("Select");
}

void TopDownShooter::SetPaused(bool paused){
  // 일시정지: 플레이어·적·탄을 세우고 메뉴. 풀면 탄 속도를 되돌림 (적은 Tick이 다시 보냄)
  Paused=paused;
  for(auto* n:{"PauseBack","PauseTitle","PauseResume","PauseQuit","PauseResumeTouch","PauseQuitTouch"})UiVisible(n,paused);
  hb::Movement2D::SetSpeed(player,paused?0.f:rules->MoveSpeed);sentSpeed=-1;  // 이동은 엔진 이동 컴포넌트가 입력으로 직접 하므로 속도를 0으로
  if(paused){hb::Physics::SetVelocity(player,hb::Vec3{0,0,0});
    for(auto* e:Enemies())hb::Physics::SetVelocity(e,hb::Vec3{0,0,0});
    for(auto* m:{&shots})for(auto& [b,life]:*m){frozenVelocity[b]=hb::Physics::GetVelocity(b);hb::Physics::SetVelocity(b,hb::Vec3{0,0,0});}}
  else{for(auto& [b,v]:frozenVelocity)if(shots.count(b))hb::Physics::SetVelocity(b,v);frozenVelocity.clear();}
}

void TopDownShooter::Bag(bool toggle,bool use){
  // 가방 (기획서 7장 Tab): 들고 있는 소재·아이템과 적재량. [귀환]이 있으면 Enter로 사용 (던전 안에서만)
  if(toggle){bagOpen=!bagOpen;if(bagOpen&&craftOpen)Craft(true,0,false);
    for(auto* n:{"BagPanel","BagTitle","BagHint","BagUseTouch"})UiVisible(n,bagOpen);}
  const bool canReturn=HasReturnItem&&!Returning&&!ReturnSuccess&&inDungeon&&area>=0;
  if(bagOpen){
    const std::string rows[]={"광물 "+std::to_string(Ore)+"   약초 "+std::to_string(Herb)+"   마물 소재 "+std::to_string(Monster),
      "빈 병 "+std::to_string(Bottle)+"   섬광탄 "+std::to_string(Flashbangs)+"   골드 "+std::to_string(Gold)+" G",
      "적재량 "+std::to_string(Weight())+" / "+std::to_string(rules->WeightLimit)+(Weight()>rules->WeightLimit?"  (무거워서 느려짐)":""),
      std::string("무기 ")+weapons[Character]+(WeaponLevel?" +1":"")+(Enchant?"   각인 있음":""),
      HasReturnItem?(canReturn?"[귀환]  Enter: 사용해서 집으로":"[귀환]  던전 안에서 쓸 수 있어"):""};
    for(int i=0;i<5;++i){UiText("BagRow"+std::to_string(i),rows[i]);UiVisible("BagRow"+std::to_string(i),!rows[i].empty());}}
  else for(int i=0;i<5;++i)UiVisible("BagRow"+std::to_string(i),false);
  if(use&&bagOpen&&canReturn){HasReturnItem=false;Returning=true;Bag(true,false);StartReturnRoom(area);Hud();Talk("ReturnStart");}
}

hb::Json TopDownShooter::Lines(const std::string& id){
  // 대사표는 장면을 열 때 통째로 한 번 읽어 둔다. 한 행씩 읽으면(GetTable) 부를 때마다 엔진에 월드 전체를 보내서 수십 ms 멈춤
  if(dialogue.is_null()){try{dialogue=hb::Data::Get(rules->DialogueTable);}catch(...){dialogue=hb::Json::object();}}
  if(!dialogue.contains(id))return hb::Json::array();
  auto lines=dialogue.at(id).value("lines",hb::Json::array());
  if(lines.is_string())try{lines=hb::Json::parse(lines.get<std::string>());}catch(...){lines=hb::Json::array();}
  return lines;
}

void TopDownShooter::Talk(const std::string& id,const std::map<std::string,std::string>& vars){
  // 대사는 데이터 표(DT_Dialogue)에서: who·name이 $me면 지금 캐릭터, text의 {이름}은 vars로 바꿈
  const hb::Json lines=Lines(id);
  auto fill=[&](std::string s){for(auto& [k,v]:vars){const std::string key="{"+k+"}";for(size_t p;(p=s.find(key))!=std::string::npos;)s.replace(p,key.size(),v);}return s;};
  for(const auto& l:lines){std::string who=l.value("who",std::string("collector")),name=l.value("name",std::string(""));
    if(who=="$me")who=faces[Character];if(name=="$me")name=koreanNames[Character];
    Say(who,fill(name),fill(l.value("text",std::string(""))));}
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
    if(pressed){if(ore&&!gatherTold){gatherTold=true;Talk("GatherTip");}
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
    if(pressed&&SofaLevel<rules->SofaMax&&Gold>=price){Gold-=price;SofaLevel++;Sfx("Coin");MaxHp++;Hp=MaxHp;ShowSofa();}}
  else if(kind=="Home"){next="E: 집에 들어가기 (원룸 Lv"+std::to_string(HomeLevel)+")";if(pressed){Leave(-2,"");return;}}
  else{next=text;if(pressed&&!text.empty())Say(faces[Character],koreanNames[Character],text);}  // Note: 가구·문 닫은 가게 등은 조사하면 혼잣말
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
   UiVisible("CraftSelect",craftOpen);UiVisible("CraftDetail",craftOpen);
   UiPosition("CraftSelect",hb::Vec2{32.f+116*col-460,128.f+116*row-258});
   UiTexture("CraftDetail",std::string("Assets/UI/Kit/")+ic.file);
   UiSize("CraftDetail",hb::Vec2{ic.w,ic.h});
   UiPosition("CraftDetail",hb::Vec2{480+(72-ic.w)/2-460,176+(72-ic.h)/2-258});}
  UiText("CraftName",names[craftPick]);
  UiText("CraftEffect",craftPick==5?(Character?"화살·마탄이 적을 뚫고 지나감":"베기 사거리 +1.5m"):effects[craftPick]);
  UiText("CraftType",craftPick<=2?"소모 아이템":"무기 각인 (귀환하면 사라짐)");
  UiText("CraftCost",cost);
}

void TopDownShooter::Craft(bool toggle,int which,bool confirm){
  // 제작 창 (기획서 6-2-2): Q로 열고 닫음, 1~5 선택, Enter로 제작. 열려 있어도 게임은 계속된다
  static const char* parts[]={"CraftPanel","CraftTitle","CraftSub","CraftIcon1","CraftIcon2","CraftIcon3","CraftIcon4","CraftIcon5",
    "CraftKey1","CraftKey2","CraftKey3","CraftKey4","CraftKey5","CraftSlot1","CraftSlot2","CraftSlot3","CraftSlot4","CraftSlot5",
    "CraftName","CraftEffect","CraftType","CraftNeed","CraftCost","CraftConfirm","CraftConfirmButton","CraftClose","CraftFooter"};
  if(toggle&&!craftOpen&&bagOpen)Bag(true,false);  // 제작 창을 열면 가방은 닫음
  if(toggle){craftOpen=!craftOpen;for(auto* n:parts)UiVisible(n,craftOpen);CraftDetail();}
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
    for(auto* n:{"LoadingBack","LoadingCoin","LoadingText","TitleBack","TitleScreen","TitleHint"})UiVisible(n,false);}
  const int hp=std::max(0,Hp);
  const bool rot=Returning;const int fill=hp<=0?0:std::max(1,(hp*3+MaxHp-1)/MaxHp);  // 귀환 중엔 황금 침식 테마
  UiVisible("HpBack",!rot);
  for(int i=1;i<=3;++i){UiVisible("HpFill"+std::to_string(i),!rot&&fill==i);UiVisible("RotHp"+std::to_string(i),rot&&fill==i);}
  // 버튼 그림: 캐릭터별 공격, 귀환 중엔 황금 침식(rot_*) 그림으로 바꿈
  static const char* themed[][3]={{"DodgeButton","btn_dodge","rot_dodge"},{"InteractButton","btn_interact","rot_interact"},{"CraftButton","btn_craft","rot_craft"},
    {"PauseButton","btn_pause","rot_pause"},{"BagButton","btn_inventory","rot_inventory"},{"Minimap","minimap","rot_minimap"}};
  const int theme=(rot?10:0)+Character;
  if(theme!=rotShown){rotShown=theme;
    for(auto& t:themed)UiTexture(t[0],std::string("Assets/UI/Kit/")+t[rot?2:1]+".png");
    UiTexture("AttackButton",std::string("Assets/UI/Kit/")+(rot?"rot_attack_":"btn_attack_")+faces[Character]+".png");}
  UiText("HpText",std::to_string(hp)+" / "+std::to_string(MaxHp));
  UiText("WeightText",std::to_string(Weight())+" / "+std::to_string(rules->WeightLimit));
  UiText("GoldText",std::to_string(Gold)+" G   빚 "+std::to_string(Debt));
  UiText("Hint",hint);
  UiValue("Fatigue",FatigueMax>0?std::min(1.f,float(Fatigue)/FatigueMax):1.f);
  UiText("Title",Hp<=0?(Fatigue>=FatigueMax?"지쳐 쓰러졌다":"쓰러졌다")
    :ReturnSuccess?"귀환 성공 - 정산 "+std::to_string(LastRepaid)+" G 상환"
    :Returning?"귀환 - 문 "+std::to_string(DoorHits)+"/"+std::to_string(rules->DoorHitsToOpen)+"  섬광탄 "+(Flashbangs?std::to_string(Flashbangs):std::to_string(rules->FlashPrice)+"G")
    :HasReturnItem?"[귀환] 획득 - Tab으로 사용":boss?"해골 대장  "+std::to_string(int(std::ceil(BossHp)))+" HP":inHome?"원룸 Lv"+std::to_string(HomeLevel):area<0?"거점":"탐색");
}

void TopDownShooter::Animate(float delta,bool moving){
  // 8방향: 그림은 남·남동·동·북동·북 5방향이고 서쪽 셋은 동쪽 그림을 뒤집는다
  // 프레임: 공격 3장(0.1초씩) > 걷기 4장(초당 8장) > 서 있기
  static const char* dirs[]={"E","NE","N","NE","E","SE","S","SE"};
  const int sector=((int)std::lround(Angle(facing)/45)%8+8)%8;
  const bool flip=sector>=3&&sector<=5;
  if(flip!=playerFlipped){playerFlipped=flip;hb::Sprites::SetFlip(player,flip,false);}
  std::string next=std::string(dirs[sector])+"_";
  if(attackAnim>0)attackAnim-=delta;
  if(dodgeTimer>0){  // 구르기: 웅크림 → 몸을 만 두 장을 번갈아 → 일어남. 그림은 아래·옆·위 셋이라 대각선은 가까운 쪽
    const float t=rules->DodgeTime-dodgeTimer;const int f=t<0.08f?0:dodgeTimer<0.12f?3:1+int((t-0.08f)/0.09f)%2;
    const char* row=sector==2||sector==1||sector==3?"N":sector>=5&&sector<=7?"S":"E";
    next=std::string(row)+"_Roll_"+std::to_string(f);}
  else if(charge>0||attackAnim>0){  // 셰리 장전(시위 걸기 → 당기기) 또는 공격 3장
    const int f=charge>0?(charge<rules->ArrowCharge*0.5f?0:1):attackAnim>0.2f?0:attackAnim>0.1f?1:2;
    // 공격 그림은 서서 하는 자세라 움직이는 중엔 윗몸은 공격·다리는 걷기인 합성 그림 (tools/make_walk_attack.py)
    if(moving){walkTime+=delta;next+="WalkAttack_"+std::to_string(f)+"_"+std::to_string(int(walkTime*10)%4);}
    else next+="Attack_"+std::to_string(f);}
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
    if(!dialog.empty()){dialog.clear();dialogIndex=0;for(auto* n:parts)UiVisible(n,false);
      UiVisible("DialogPortrait",false);shownWho="";}
    return false;
  }
  const Line& l=dialog[dialogIndex];
  if(shownWho!=l.who){
    if(shownWho.empty())for(auto* n:parts)UiVisible(n,true);
    for(const auto& p:portraits)if(l.who==p.who){
      UiTexture("DialogPortrait",std::string("Assets/UI/Kit/portrait_")+p.who+".png");
      UiSize("DialogPortrait",hb::Vec2{p.w,p.h});
      UiPosition("DialogPortrait",hb::Vec2{26+(120-p.w)/2-500,25+(120-p.h)/2-194});}
    UiVisible("DialogPortrait",true);
    UiText("DialogName",l.name);shownWho=l.who;
  }
  const size_t total=Utf8Count(l.text);
  if(advance){
    Sfx("Select");if(shownChars<total)shownChars=total;
    else{dialogIndex++;shownChars=0;typeTime=0;if(dialogIndex<dialog.size()&&dialog[dialogIndex].who==shownWho)UiText("DialogName",dialog[dialogIndex].name);
      UiText("DialogText","");return true;}
  }else if(shownChars<total){typeTime+=delta;const size_t next=std::min(total,size_t(typeTime*rules->TypeSpeed));if(next==shownChars)return true;shownChars=next;}
  else return true;
  UiText("DialogText",Utf8Prefix(l.text,shownChars));
  UiVisible("DialogNext",shownChars>=total);
  return true;
}

void TopDownShooter::ShowSelect(bool visible){
  for(auto* n:{"SelectBack","SelectTitle","SelectHint","SelectConfirm"})UiVisible(n,visible);
  for(int i=0;i<3;++i){const std::string k=std::to_string(i);
    for(auto* n:{"SelectCard","SelectArt","SelectName","SelectWeapon","SelectDebt","SelectTouch"})UiVisible(n+k,visible);
    UiVisible("SelectPick"+k,visible&&i==pick);}
}

// 아무 키·마우스 버튼·터치를 이번 프레임에 눌렀는지. 일시정지·운영자 키는 빼고, move=false면 이동 키도 뺀다 (대화 중 걷다가 넘어가지 않게)
static bool AnyPressed(bool move){
  if(!hb::Input::AnyKeyPressed())return false;
  for(auto* k:{"escape","p","tab","F3","F9","F10","F12"})if(hb::Input::WasPressedThisFrame(k))return false;
  if(!move)for(auto* k:{"w","a","s","d","arrowup","arrowdown","arrowleft","arrowright"})if(hb::Input::WasPressedThisFrame(k))return false;
  return true;
}

bool TopDownShooter::UpdateIntro(float delta,bool anyKey){
  // 로딩(금화 GIF) → 타이틀(아무 키) → 캐릭터 선택 → 오프닝 대화 (기획서 2장)
  if(Phase>=2)return false;
  phaseTime+=delta;hb::Physics::SetVelocity(player,hb::Vec3{0,0,0});
  if(Phase==0&&phaseTime>=rules->LoadingTime){Phase=1;phaseTime=0;
    for(auto* n:{"LoadingBack","LoadingCoin","LoadingText"})UiVisible(n,false);}
  else if(Phase==1&&!selecting&&anyKey&&phaseTime>0.3f){selecting=true;phaseTime=0;
    for(auto* n:{"TitleBack","TitleScreen","TitleHint"})UiVisible(n,false);introHidden=true;confirmHeld=true;ShowSelect(true);}
  else if(Phase==1&&selecting){
    // 1·2·3, A·D, ←→로 고르고 Enter·E·Space로 결정. 카드를 누르면 그 숫자 키가 눌리고, 고른 카드를 한 번 더 누르면 결정
    int key=0;for(int i=1;i<=3;++i)if(hb::Input::IsKeyDown(std::to_string(i)))key=i;
    const int side=hb::Input::IsKeyDown("d")||hb::Input::IsKeyDown("arrowright")?4:hb::Input::IsKeyDown("a")||hb::Input::IsKeyDown("arrowleft")?5:0;
    const int now=key?key:side;
    const bool confirm=hb::Input::IsKeyDown("enter")||hb::Input::IsKeyDown("e")||hb::Input::IsKeyDown("space");
    if(phaseTime<0.25f){pickHeld=now;confirmHeld=confirm;return true;}  // 타이틀을 넘긴 그 키가 바로 고르거나 결정하지 않게
    const bool again=key&&now!=pickHeld&&key-1==pick;
    if(now&&now!=pickHeld&&!again){pick=key?key-1:(pick+(side==4?1:2))%3;ShowSelect(true);Sfx("Select");}
    pickHeld=now;
    const bool fresh=(confirm&&!confirmHeld)||again;confirmHeld=confirm;
    if(!fresh)return true;
    selecting=false;Phase=2;Character=pick;if(pick<(int)rules->Debts.size())Debt=rules->Debts[pick];currentSprite="";ShowSelect(false);advanceHeld=true;Animate(0,false);Hud();
    Talk("Opening1");Talk(std::string("Intro_")+faces[pick]);Talk("Opening2");  // 오프닝: 수금원 → 고른 캐릭터 한마디 → 수금원
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
  {// 성능 확인: F3으로 왼쪽 위에 초당 게임 프레임과 0.5초 동안 가장 긴 프레임
   const bool f3=hb::Input::IsKeyDown("F3");if(f3&&!fpsHeld){ShowFps=!ShowFps;if(player&&frame>=2)UiVisible("Fps",ShowFps);}fpsHeld=f3;
   fpsTime+=delta;fpsFrames++;fpsWorst=std::max(fpsWorst,delta);
   if(fpsTime>=0.5f){if(ShowFps&&player&&frame>=2){UiVisible("Fps",true);
       UiText("Fps",std::to_string(int(fpsFrames/fpsTime+0.5f))+" FPS  최장 "+std::to_string(int(fpsWorst*1000+0.5f))+"ms");}
     fpsTime=0;fpsFrames=0;fpsWorst=0;}}
  if(minimapDirty&&frame>=2){minimapDirty=false;UpdateMinimap();}  // 위젯은 첫 프레임 뒤에 생김
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
   if(hb::Input::IsKeyDown("F12")||(idleTime>=rules->IdleReset&&!(Phase<2&&!selecting))||(ending&&(anyPressed||AnyPressed(true)))){ResetToTitle();return;}
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
  if(cutscene>0)MoveCamera(cutsceneAt,cutsceneAt,false,delta);  // 보스 등장 컷신: 카메라가 보스 자리로
  else MoveCamera(position,touchMode?position+facing*(rules->CameraLeadMax/rules->CameraLead*0.5f):aim,(hasAim||touchMode)&&Phase>=2,delta);
  {const bool adv=hb::Input::IsKeyDown("e")||hb::Input::IsKeyDown("LeftMouseButton")||hb::Input::IsKeyDown("enter")||hb::Input::IsKeyDown("space");
   const bool pressed=adv&&!advanceHeld;advanceHeld=adv;
   if(frame>=2&&UpdateIntro(delta,pressed||AnyPressed(true)))return;
   {const bool p=hb::Input::IsKeyDown("escape")||hb::Input::IsKeyDown("p");  // 일시정지 (Esc·P)
    if(p&&!pauseHeld&&Phase>=2&&settleTime<0&&!ending)SetPaused(!Paused);pauseHeld=p;
    if(Paused)return;}
   if(tipTime>0&&(tipTime-=delta)<=0){UiVisible("TipBack",false);UiVisible("Tip",false);}
   if(cutscene>0){  // 보스 등장: 1초 마법진 → 보스 → 1.3초 포효(흔들림)·이름 자막 → 끝나면 대사
     cutscene-=delta;hb::Physics::SetVelocity(player,hb::Vec3{0,0,0});
     if(!roared&&cutscene<1.9f){roared=true;shake=0.7f;Sfx("BossCharge");hb::Camera::Flash(hb::Color{1,0.85f,0.4f,0.35f},0.3f);
       for(auto* e:Enemies())if(e->Boss){UiText("BossName",e->DisplayName);UiText("BossSub","황금에 잠식된 1층의 문지기");}
       for(auto* n:{"BossName","BossSub"})UiVisible(n,true);}
     if(cutscene<=0){for(auto* n:{"CineTop","CineBottom","BossName","BossSub"})UiVisible(n,false);
       for(auto* e:Enemies())if(e->Boss)Talk("Boss",{{"boss",e->DisplayName}});}
     return;}
   if(bannerTime>0&&(bannerTime-=delta)<=0)UiVisible("BossSub",false);
   if(UpdateSettle(delta,pressed)){flashHeld=true;dodgeHeld=true;attackCooldown=0.2f;hb::Physics::SetVelocity(player,hb::Vec3{0,0,0});return;}
   if(UpdateDialog(delta,pressed||AnyPressed(false))){flashHeld=true;dodgeHeld=true;attackCooldown=0.2f;hb::Physics::SetVelocity(player,hb::Vec3{0,0,0});return;}}  // 대화 중엔 행동·이동 막음
  if(!inDungeon&&!inHome&&Phase>=2&&settleTime<0)Tip(0);  // 거점: 북쪽 계단으로 (오프닝 대화가 끝난 뒤)
  if(inHome){if(position.y<exitY){Leave(-1,"HomeDoor");return;}}  // 원룸 문 → 거점 집 앞
  else if(!inDungeon){  // 거점 계단 끝 → 던전 (들어갈 때마다 새 층). 계단에 막 도착했으면 한 번 내려와야 다시 들어감 (W를 누른 채 왔다 갔다 방지)
    if(position.y<exitY-2)exitArmed=true;
    if(exitArmed&&position.y>exitY){Leave(0,"");return;}}
  else{
    // 시작 방 계단에 닿으면 거점으로 (귀환 중이면 귀환 성공)
    if(map.stairs&&fightingRoom<0&&Length(hb::Scene::GetPosition(map.stairs)-position)<1.0f){Leave(-1,"StairTop");return;}
    const int at=map.RoomAt(position);
    if(at>=0&&at!=area){area=at;RoomIndex=at;roomKind=map.rooms[at].kind;
      map.Show(at);Layout=map.Describe().dump();  // 내 주변 방만 깔기
      auto& r=map.rooms[at];r.visited=r.seen=true;for(int d=0;d<4;++d)if(r.link[d]>=0)map.rooms[r.link[d]].seen=true;
      UpdateMinimap();Hud();}
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
  if(Hp<=0){  // 쓰러짐 (기획서 2장): "빈손으로 끌려 나왔다" → 소재를 잃고 거점에서 정산
    hb::Physics::SetVelocity(player,hb::Vec3{0,0,0});
    ClearBullets();
    if(gameOver==rules->RespawnDelay){
      UiText("KoTitle",Fatigue>=FatigueMax?"지쳐 쓰러졌다":"쓰러졌다");
      UiText("KoSub","빈손으로 끌려 나왔다 - 들고 있던 소재를 잃었다");
      for(auto* n:{"KoBack","KoTitle","KoSub"})UiVisible(n,true);
      hb::Camera::Flash(hb::Color{0.6f,0,0,0.6f},0.6f);}
    if((gameOver-=delta)<=0){
      for(auto* n:{"KoBack","KoTitle","KoSub"})UiVisible(n,false);
      Ore=Herb=Monster=0;KnockedOut=true;Returning=false;HasReturnItem=false;Hp=MaxHp;Leave(-1,"StairTop");}
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
  // 공격·활 당기기 중 이동속도 배율 (그림은 걸으며 공격하는 합성 그림이라 멈출 필요는 없음)
  {const float act=Character==0&&attackAnim>0?rules->AttackMoveRate:Character==1&&charge>0?rules->ChargeMoveRate:1.f;
   const float speed=act*rules->MoveSpeed*((Weight()>rules->WeightLimit||Fatigue*4>=FatigueMax*3)?rules->SlowRate:1.f);
   if(speed!=sentSpeed){sentSpeed=speed;hb::Movement2D::SetSpeed(player,speed);}}
  attackCooldown-=delta;dodgeCooldownLeft-=delta;invulnerable-=delta;

  // 회피: Space를 누른 순간 바라보는 방향으로 대시, 대시 중 무적
  const bool dodgeDown=hb::Input::IsKeyDown("space")||hb::Input::IsKeyDown(" ");
  if(dodgeDown&&!dodgeHeld&&dodgeCooldownLeft<=0&&dodgeTimer<=0){dodgeTimer=rules->DodgeTime;dodgeCooldownLeft=rules->DodgeCooldown;Sfx("Dodge");
    Effect("Dust",hb::Vec3{position.x,position.y-0.8f,0.03f},0,0,facing.x>0);}
  dodgeHeld=dodgeDown;
  if(dodgeTimer>0){dodgeTimer-=delta;hb::Physics::SetVelocity(player,facing*rules->DodgeSpeed);}
  else if(knockTimer>0){knockTimer-=delta;hb::Physics::SetVelocity(player,knock);}
  {const bool blink=invulnerable>0&&int(invulnerable*12)%2==0;  // 무적 시간 깜빡임
   if(blink!=blinkShown){blinkShown=blink;const float v=blink?0.4f:1.f;hb::Sprites::SetColor(player,hb::Color{v,v,v,1});}}  // 투명도를 바꾸면 렌더 재질을 다시 만들어 끊김

  // 가방 (Tab): 열고 닫기, 열린 채 Enter면 [귀환] 사용. 귀환 중 섬광탄 (E): 제작한 것 먼저, 없으면 골드
  const bool tab=hb::Input::IsKeyDown("tab");
  {const bool enter=hb::Input::IsKeyDown("enter");Bag(tab&&!returnHeld,enter&&!confirmHeld&&bagOpen);}
  returnHeld=tab;
  const bool flash=hb::Input::IsKeyDown("e");
  if(!Returning)Interact(position,flash&&!flashHeld);
  else if(flash&&!flashHeld&&(Flashbangs>0||Gold>=rules->FlashPrice)){if(Flashbangs>0)Flashbangs--;else Gold-=rules->FlashPrice;StunAll(rules->FlashStun);Sfx("Flash");
    ClearBullets();Hud();}
  flashHeld=flash;
  {const bool q=hb::Input::IsKeyDown("q"),enter=hb::Input::IsKeyDown("enter");int which=0;
   for(int i=1;i<=5;++i)if(hb::Input::IsKeyDown(std::to_string(i)))which=i;
   Craft(q&&!craftKeyHeld,which,enter&&!confirmHeld);craftKeyHeld=q;confirmHeld=enter;}

  // 공격: 발렌 검 베기, 셰리 당겼다 떼서 쏘는 활, 알레아 마탄 연사
  if(Character==1){  // 누르는 동안 당기고(1초면 다 당김, 그 뒤로는 유지) 떼는 순간 발사. 덜 당기고 떼면 취소
    if(attackDown&&attackCooldown<=0){const bool full=charge>=rules->ArrowCharge;charge=std::min(charge+delta,rules->ArrowCharge);
      if(!full&&charge>=rules->ArrowCharge){hb::Sprites::Flash(player,0.08f,0.5f);Sfx("Select");}}
    else if(!attackDown&&charge>0){if(charge>=rules->ArrowCharge){Shoot(position);attackAnim=0.1f;attackCooldown=0.15f;}charge=0;}}
  else if(Character==2&&attackDown&&attackCooldown<=0){attackCooldown=rules->BoltInterval;attackAnim=0.2f;Shoot(position);}
  else if(Character==0&&attackDown&&attackCooldown<=0)Slash(position,enemies);
  UpdateShots(delta,enemies);

  // 골드: 가까이 가면 끌려와서 주워짐
  for(auto it=coins.begin();it!=coins.end();){auto* c=it->first;const auto d=position-hb::Scene::GetPosition(c);const float len=Length(d);
    if(len<rules->CoinPickup){Gold+=it->second;Sfx("Coin");Effect("CoinSparkle",hb::Scene::GetPosition(c)+hb::Vec3{0,0.3f,0.3f},0,1.f);Give(coinPool,c);it=coins.erase(it);Hud();continue;}
    if(len<rules->CoinMagnet)hb::Scene::SetPosition(c,hb::Scene::GetPosition(c)+d*(std::min(1.f,delta*8)));
    ++it;}
  if(boss)BossHp=boss->Hp;
  {// 보스 체력 막대 (화면 위)
   const float ratio=boss&&boss->MaxHp>0?std::max(0.f,boss->Hp/boss->MaxHp):-1.f;
   if(ratio!=bossBarShown){if((ratio<0)!=(bossBarShown<0))for(auto* n:{"BossBarBack","BossBar","BossBarName"})UiVisible(n,ratio>=0);
     if(ratio>=0){UiValue("BossBar",ratio);if(bossBarShown<0)UiText("BossBarName",boss->DisplayName);}
     bossBarShown=ratio;}}
}
