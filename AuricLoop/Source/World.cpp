#include "Common.h"
#include <cmath>
#include <algorithm>
#include <chrono>
#include <map>
#include <random>
#include <set>
#include <sstream>
#include <string>

static AuricRules fallbackRules;  // 장면에 BP_AuricRules가 없을 때

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
  {int k=0;for(auto* tag:{"UI.HUD","UI.Front","UI.Fast","UI.Map"}){const auto a=hb::Scene::GetActorsWithTag(tag);uiHosts[k++]=a.empty()?nullptr:a.front();}uiSent.clear();}
  // 장면 첫 프레임: 이 장면의 구역(RoomInfo), 상호작용 대상, 카메라를 찾고 진행을 이어받는다
  started=true;Hp=MaxHp;bannerPending=true;  // 도착한 곳 이름을 가운데에
  rules=&fallbackRules;for(auto* a:hb::Scene::GetAllActorsOfClass("AuricRules"))if(auto* r=dynamic_cast<AuricRules*>(a))rules=r;
  Lines("");  // 대사표 미리 읽기 (로딩 화면 동안)
  for(auto* a:hb::Scene::GetAllActorsOfClass("RoomInfo"))if(auto* r=dynamic_cast<RoomInfo*>(a)){
    area=r->Index;roomKind=r->Kind;exitY=r->ExitY;camMin={r->CamMinX,r->CamMinY,0};camMax={r->CamMaxX,r->CamMaxY,0};inDungeon=r->Kind=="Dungeon";inHome=r->Kind=="Home";}
  for(auto* a:hb::Scene::GetAllActorsOfClass("Interactable"))if(auto* i=dynamic_cast<Interactable*>(a))interactables.push_back(i);
  auto cams=hb::Scene::GetActorsWithTag("MainCamera");camera=cams.empty()?nullptr:cams.front();
  if(camera)hb::Components::SetFloat(camera,"Camera","orthographicSize",rules->CameraSize);  // 줌은 BP_AuricRules.CameraSize 하나로
  const bool carried=LoadRun();
  if(!carried&&KeepProgress){const auto p=hb::Save::Read("Auric.progress");
    if(p.is_object()){Debt=p.value("debt",Debt);SofaLevel=p.value("sofa",SofaLevel);HomeLevel=p.value("home",HomeLevel);MaxHp=3+SofaLevel;Hp=MaxHp;}}
  if(carried||area>=0)Phase=std::max(Phase,2);  // 장면을 넘어왔거나 던전에서 바로 시작하면 로딩·타이틀 생략
  RoomIndex=area;
  {const auto w=hb::Scene::GetActorsWithTag("PlayerWeapon");weapon=w.empty()?nullptr:w.front();weaponShown.clear();slashFx=nullptr;slashShown.clear();swingT=-1;vsPreloaded=false;  // 손에 단 검·손가락 (모든 장면)
   const auto g=hb::Scene::GetActorsWithTag("PlayerGrip");grip=g.empty()?nullptr:g.front();gripShown.clear();}
  // 던전: 층 만들기(StartFloor)가 한 번 0.5초쯤 멈추므로 그동안 검은 화면에서 밝아지게 가림
  if(inDungeon){hb::Camera::Flash(hb::Color{0,0,0,1},0.8f);Prewarm();StartFloor();}
  if(inHome)ShowSofa();
  else if(Returning||KnockedOut){Returning=false;ReturnSuccess=true;Settle();}  // 거점에 닿으면 귀환 성공 (쓰러졌으면 소재 없이 정산)
  Hud();
}

void TopDownShooter::StartFloor(){
  // 새 층: 데이터 에셋으로 방을 무작위로 잇고, 장면 풀로 바닥·벽·장식을 깐다. 플레이어는 시작 방 계단 아래에 선다
  const auto floor=hb::Data::Get(rules->FloorData);roomTable=hb::Data::Get(rules->RoomTable);
  // 들어갈 때마다 다른 층: 진짜 난수 + 시계 (std::rand는 씨앗을 안 줘서 매번 같은 수였음). Seed를 정하면(검사용) 그 층 그대로
  const unsigned seed=Seed?unsigned(Seed):unsigned(std::random_device{}()^unsigned(std::chrono::steady_clock::now().time_since_epoch().count()));
  if(!Seed)std::srand(seed);  // 웨이브 자리·파편 등 std::rand도 판마다 다르게
  map.Generate(seed,floor,roomTable);
  map.Build();
  goldPiles=hb::Scene::GetActorsWithTag("Dungeon.Gold");goldTaken.clear();  // 방에 쌓인 금 더미 (다가가면 주움)
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

void TopDownShooter::DrawMap(bool big){
  // 지도 (W_Map): 방을 실제 크기·자리 그대로, 복도도 실제 폭(2.67m)으로 이어 그림. 아는 방(지나간 방의 이웃)만 보이고
  // 지금 방 금빛, 가 본 방 밝게, 아직 안 간 방 어둡게, 보스방 붉게. 특별한 방엔 아이콘(보스·상점·채집·시작 계단), 내 위치는 흰 점
  // 미니맵: 오른쪽 위 틀(160x128) 안 144x108 / 크게: 화면 가운데 720x420 + 지역 이름
  if(!inDungeon||frame<2)return;
  const float C=4.f/3;  // Dungeon.cpp CORRIDOR
  float minX=1e9f,maxX=-1e9f,minY=1e9f,maxY=-1e9f;
  for(auto& r:map.rooms)if(r.seen){minX=std::min(minX,r.cx-r.hw);maxX=std::max(maxX,r.cx+r.hw);minY=std::min(minY,r.cy-r.hh);maxY=std::max(maxY,r.cy+r.hh);}
  if(minX>maxX){minX=-10;maxX=10;minY=-10;maxY=10;}
  const float L=big?-1000.f:-176.f,T=big?200.f:118.f,W=big?720.f:144.f,H=big?390.f:108.f;  // 큰 지도: 제목·부제(위) 와 닫기 안내(아래) 사이
  // 아는 방들만 틀에 맞춤 (처음엔 크게, 많이 알수록 작게). 너무 확대되지 않게 최소 폭 큰 지도 120m·미니맵 90m
  {const float span=big?120.f:90.f,cx=(minX+maxX)/2,cy=(minY+maxY)/2;
   if(maxX-minX<span){minX=cx-span/2;maxX=cx+span/2;}if(maxY-minY<span*H/W){minY=cy-span*H/W/2;maxY=cy+span*H/W/2;}}
  const float s=std::min(W/(maxX-minX),H/(maxY-minY));
  mapScale=s;mapLeft=L+(W-(maxX-minX)*s)/2;mapTop=T+(H-(maxY-minY)*s)/2;mapMinX=minX;mapMaxY=maxY;
  auto px=[&](float x){return mapLeft+(x-minX)*s;};auto py=[&](float y){return mapTop+(maxY-y)*s;};
  auto rect=[&](const std::string& n,float x0,float y0,float x1,float y1){
    UiPosition(n,hb::Vec2{px(x0),py(y1)});UiSize(n,hb::Vec2{std::max(2.f,(x1-x0)*s),std::max(2.f,(y1-y0)*s)});};
  int links=0;
  for(int i=0;i<int(map.rooms.size())&&i<16;++i){
    const auto& r=map.rooms[i];const std::string id=std::to_string(i);
    rect("MapRoom"+id,r.cx-r.hw,r.cy-r.hh,r.cx+r.hw,r.cy+r.hh);UiVisible("MapRoom"+id,r.seen);
    if(r.seen)UiTexture("MapRoom"+id,std::string("Assets/UI/Map/cell_")+(i==area?"current":r.kind=="Boss"?"boss":r.visited?"visited":"seen")+".png");
    const char* icon=r.kind=="Boss"?"boss":r.kind=="Shop"?"shop":r.kind=="Gather"?"gather":r.kind=="Start"?"start":nullptr;
    UiVisible("MapIcon"+id,r.seen&&icon);
    if(r.seen&&icon){const float k=big?28:std::min(12.f,std::min(r.hw,r.hh)*2*s);UiTexture("MapIcon"+id,std::string("Assets/UI/Map/icon_")+icon+".png");
      UiPosition("MapIcon"+id,hb::Vec2{px(r.cx),py(r.cy)});UiSize("MapIcon"+id,hb::Vec2{k,k});}
    for(int d:{0,1}){const int j=r.link[d];if(j<0||links>=24)continue;const auto& o=map.rooms[j];const std::string ln="MapLink"+std::to_string(links++);
      if(d==0)rect(ln,r.cx-C,r.cy+r.hh,r.cx+C,o.cy-o.hh);else rect(ln,r.cx+r.hw,r.cy-C,o.cx-o.hw,r.cy+C);
      UiVisible(ln,r.seen&&o.seen);}
  }
  for(int k=links;k<24;++k)UiVisible("MapLink"+std::to_string(k),false);
  for(int i=int(map.rooms.size());i<16;++i){UiVisible("MapRoom"+std::to_string(i),false);UiVisible("MapIcon"+std::to_string(i),false);}
  UiSize("MapHere",hb::Vec2{big?12.f:7.f,big?12.f:7.f});
  for(auto* n:{"MapBigBack","MapBigFrame","MapBigTitle","MapBigSub","MapBigHint"})UiVisible(n,big);
  if(big){UiText("MapBigTitle","황금 던전");UiText("MapBigSub","1층 - 마몬의 입 속");}
}

void TopDownShooter::UpdateMapLayer(){
  // 지도 위젯은 HUD 창(가방·메뉴·대화·정산·제작) 위에 그려지므로 그런 창이 열리면 통째로 숨김. 내 위치 점은 1px 넘게 움직일 때만
  const bool show=inDungeon&&Phase>=2&&!bagOpen&&!craftOpen&&!Paused&&settleTime<0&&dialogIndex>=dialog.size()&&!ending&&Hp>0;
  if(show!=mapShown&&uiHosts[3]){mapShown=show;hb::UI::SetVisible(uiHosts[3],"Map","Root",show);}
  UiVisible("Minimap",show&&!mapOpen);  // 미니맵 틀(HUD)도 지도와 같이: 창이 열리거나 큰 지도면 숨김
  if(!show)return;
  UiVisible("MapHere",true);
  UiPosition("MapHere",hb::Vec2{mapLeft+(playerAt.x-mapMinX)*mapScale,mapTop+(mapMaxY-(playerAt.y-0.95f))*mapScale});
}

void TopDownShooter::ShowSofa(){
  // 원룸 소파 그림을 레벨에 맞게 (0 빈 자리 → 낡은 소파 → 가죽 → 황금 벨벳). 빈 자리일 땐 걸어 지나갈 수 있게 충돌 끔
  if(rules->SofaSprites.empty())return;
  const auto& path=rules->SofaSprites[std::min<size_t>(SofaLevel,rules->SofaSprites.size()-1)];
  for(auto* i:interactables)if(i->Kind=="Sofa"){hb::Sprites::SetSprite(i,path);hb::Components::SetBool(i,"BoxCollider2D","enabled",SofaLevel>0);}
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
  if(r.kind!="Combat"&&r.kind!="Boss"){r.state=2;if(r.kind=="Shop")Tip(6);return;}  // 시작·채집·상점은 싸움 없음
  r.state=1;fightingRoom=room;map.Lock(room,true);Sfx("Lock");  // 조작 안내는 글 대신 시작 방 그림 표지판
  if(r.kind=="Boss"){cutscene=3.2f;cutsceneAt=hb::Vec3{r.cx,r.cy+2,0};roared=false;bannerTime=0;  // 보스 등장 컷신: 화면 위아래 검은 띠, 카메라가 보스 쪽으로
    for(auto* n:{"CineTop","CineBottom"})UiVisible(n,true);}
  const hb::Json row=roomTable.contains(r.row)?roomTable.at(r.row):hb::Json::object();
  waves.clear();std::stringstream ss(row.value("waves",std::string("S,S,S")));std::string w;while(std::getline(ss,w,'|'))if(!w.empty())waves.push_back(w);
  wave=0;monsterDrop=row.value("monsterDrop",false);
  if(!waves.empty())SpawnWave(waves[0],false);
  if(r.kind=="Boss")for(auto& p:pending)p.left=std::min(p.left,0.5f);  // 보스는 컷신 시작 0.5초 만에 나타남 (카메라가 비추는 동안)
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
      if(spawnSfxFrame!=frame){spawnSfxFrame=frame;Sfx("Spawn",0.95f+float(std::rand()%10)/100);}  // 같은 프레임에 여럿 나와도 한 번
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
  map.rooms[fightingRoom].state=2;map.Lock(fightingRoom,false);fightingRoom=-1;waves.clear();Sfx("Clear");
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
  // 정산 (기획서 6-4): 소재를 골드로 바꾸고 일부를 빚에서 자동 상환, 강화는 초기화. 연출은 UpdateSettle (동전이 차오름)
  settleItems={{Ore,Ore*rules->OrePrice},{Herb,Herb*rules->HerbPrice},{Monster,Monster*rules->MonsterPrice},{Gold,Gold}};
  settleTotal=Gold+Ore*rules->OrePrice+Herb*rules->HerbPrice+Monster*rules->MonsterPrice;
  LastRepaid=int(settleTotal*rules->RepayRate);debtFrom=Debt;Debt=std::max(0,Debt-LastRepaid);debtTo=Debt;
  Gold=settleTotal-LastRepaid;Ore=Herb=Monster=0;WeaponLevel=0;Enchant=0;
  settleTime=0;settleShown=0;debtShown=-1;settleDone=false;
  SaveRun();Hud();
}

void TopDownShooter::ShowSettle(bool visible){
  for(auto* n:{"SettleBack","SettleGlow","SettleRibbon","SettleTitle","SettleCoinBack","SettleCoinText","SettlePlaque","SettleDebt"})UiVisible(n,visible);
  for(int k=0;k<4;++k){UiVisible("SettleIcon"+std::to_string(k),visible);UiVisible("SettleCount"+std::to_string(k),visible);}
  if(!visible){UiVisible("SettleRepay",false);UiVisible("SettleHint",false);}
}

bool TopDownShooter::UpdateSettle(float delta,bool advance){
  // 동전 정산: 0.4초 뒤부터 소재·골드 아이콘이 0.55초마다 하나씩 가운데 동전으로 날아가(0.35초) 들어가면 동전이 그만큼 차오르고 금액이 오름.
  // 다 들어가면 상환분 "-N G"가 동전에서 아래 빚 명패로 날아가고 남은 빚이 1초 동안 줄어듦. 누르면 끝으로 건너뜀
  if(settleTime<0||frame<2)return settleTime>=0;
  static const char* names[]={"광물","약초","마물 소재","골드"};
  static const float iconX[]={-270,-90,90,270};
  if(settleTime==0){
    UiText("SettleTitle",KnockedOut?"빈손으로 끌려 나왔다":"귀환 성공");
    for(int k=0;k<4;++k){const auto& it=settleItems[k];
      UiText("SettleCount"+std::to_string(k),std::string(names[k])+(k==3?"  ":" x"+std::to_string(it.count)+"  ")+std::to_string(it.value)+" G");
      UiColor("SettleCount"+std::to_string(k),it.value>0?hb::Color{0.96f,0.93f,0.85f,1}:hb::Color{0.45f,0.42f,0.38f,1});
      UiOpacity("SettleIcon"+std::to_string(k),it.value>0?1.f:0.3f);UiPosition("SettleIcon"+std::to_string(k),hb::Vec2{iconX[k],-180});UiScale("SettleIcon"+std::to_string(k),1);}
    SettleFill(0);UiText("SettleCoinText","0 G");UiScale("SettleCoinBack",1);UiScale("SettleCoin",1);
    settleShown=0;ShowSettle(true);}
  settleTime+=delta;
  const float start=0.4f,gap=0.55f,fly=0.35f;
  float filled=0;int shownValue=0;bool bump=false;
  for(int k=0;k<4;++k){const auto& it=settleItems[k];if(it.value<=0)continue;
    const float t=(settleTime-start-gap*k)/fly;const std::string n="SettleIcon"+std::to_string(k);
    if(t<=0)continue;
    if(t<1){const float e=t*t;  // 빨려 들어가듯 점점 빠르게, 작아지며 위로 살짝 떴다가
      UiPosition(n,hb::Vec2{iconX[k]*(1-e),-180*(1-e)-10*e-std::sin(t*3.14159f)*40});UiScale(n,1-0.6f*e);}
    else{const bool back=t>1.4f;  // 동전에 들어간 뒤 0.14초면 제자리에 다시 (끝 화면에도 소재·골드 그림이 남게)
      UiOpacity(n,back?1.f:0.f);if(back){UiPosition(n,hb::Vec2{iconX[k],-180});UiScale(n,1);}
      filled+=float(it.value);shownValue+=it.value;bump=bump||t<1.3f;  // 들어간 직후 0.1초 동안 동전이 톡 커짐
      if(settleShown<=k){settleShown=k+1;Sfx("Coin",0.9f+0.08f*k);}}}
  UiScale("SettleCoinBack",bump?1.1f:1.f);UiScale("SettleCoin",bump?1.1f:1.f);
  const float coinT=settleTotal>0?filled/settleTotal:0;
  SettleFill(coinT);if(!settleDone)UiText("SettleCoinText",std::to_string(shownValue)+" G");
  UiOpacity("SettleGlow",0.35f+0.25f*coinT+0.08f*std::sin(settleTime*4));UiScale("SettleGlow",0.8f+0.3f*coinT);  // 차오를수록 빛이 커짐
  const float last=start+gap*3+fly;  // 마지막 아이콘이 들어간 뒤
  // 상환: 동전에서 빠져나가 명패로 (0.5초), 그다음 빚이 1초 동안 줄어듦
  const float rt=(settleTime-last-0.3f)/0.5f;
  if(LastRepaid>0&&rt>0){UiVisible("SettleRepay",rt<1.4f);UiText("SettleRepay","빚 상환  -"+std::to_string(LastRepaid)+" G");
    UiPosition("SettleRepay",hb::Vec2{0,40.f+std::min(rt,1.f)*150});
    if(settleTotal>0)SettleFill(coinT*(1-std::min(rt,1.f)*float(LastRepaid)/settleTotal));}  // 상환한 만큼 동전이 다시 줄어듦
  const float t=std::clamp((settleTime-last-0.8f)/1.0f,0.f,1.f);
  const int debt=debtFrom+int((debtTo-debtFrom)*t);
  if(debt!=debtShown){debtShown=debt;UiText("SettleDebt","남은 빚  "+std::to_string(debt)+" G");if(t>0&&t<1&&int(t*20)%3==0)Sfx("Type",0.7f);}
  if(t>=1&&!settleDone){settleDone=true;UiText("SettleCoinText","내 몫  "+std::to_string(settleTotal-LastRepaid)+" G");Sfx("Craft");}
  UiVisible("SettleHint",settleDone);
  if(advance){
    if(!settleDone){settleTime=last+1.9f;return true;}  // 누르면 끝으로
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
  leaving=true;hb::Clock::SetTimeScale(1.f);hb::Game::Reset();  // 새 세션으로 시작 장면(거점)부터 (메뉴에서 왔으면 시간 정지 풀고)
}

void TopDownShooter::Tip(int id){
  return;  // 갑자기 뜨는 안내 말풍선은 쓰지 않음 (조작은 시작 방 그림 표지판으로). 다시 쓰려면 이 줄을 지움
  if(TipsShown&(1<<id)||!player||frame<2)return;TipsShown|=1<<id;
  std::string text;
  for(const auto& row:{std::string(touchMode?"TipTouch":"Tip")+std::to_string(id),"Tip"+std::to_string(id)}){
    const auto lines=Lines(row);if(!lines.empty()){text=lines[0].value("text",std::string(""));break;}}
  if(text.empty())return;
  UiText("Tip",text);UiVisible("TipBack",true);UiVisible("Tip",true);tipTime=5;Sfx("Select");
}

void TopDownShooter::SetPaused(bool paused){
  // 일시정지: 플레이어·적·탄을 세우고 메뉴. 풀면 탄 속도를 되돌림 (적은 Tick이 다시 보냄)
  Paused=paused;menuPick=0;menuHeld=~0;  // 연 키가 바로 고르지 않게
  hb::Clock::SetTimeScale(paused?0.0001f:1.f);  // 게임 시간 정지: 물리·적 상태 머신·애니메이션·입자·타이머가 멈춤.
                                                // 완전히 0이면 엔진이 매 프레임 게임 규칙(Tick)도 안 불러 메뉴 입력을 못 받으므로 아주 느리게
  for(auto* n:{"MenuBack","MenuPanel","MenuTitle","MenuSelect","MenuHelp","MenuResume","MenuResumeBack","MenuResumeTouch","MenuVolume","MenuVolumeBack",
               "MenuVolDown","MenuVolUp","MenuMusic","MenuMusicBack","MenuMusDown","MenuMusUp","MenuQuit","MenuQuitBack","MenuQuitTouch"})UiVisible(n,paused);
  if(paused)UpdateMenu();
  for(int k:{2,3})if(uiHosts[k])hb::UI::SetVisible(uiHosts[k],k==2?"Fast":"Map","Root",!paused);mapShown=!paused;  // 말풍선·지도는 따로 그려져 메뉴 위로 올라오므로 숨김
  hb::Movement2D::SetSpeed(player,paused?0.f:rules->MoveSpeed);sentSpeed=-1;  // 이동은 엔진 이동 컴포넌트가 입력으로 직접 하므로 속도를 0으로
  if(paused){hb::Physics::SetVelocity(player,hb::Vec3{0,0,0});
    for(auto* e:Enemies())hb::Physics::SetVelocity(e,hb::Vec3{0,0,0});
    for(auto* m:{&shots})for(auto& [b,life]:*m){frozenVelocity[b]=hb::Physics::GetVelocity(b);hb::Physics::SetVelocity(b,hb::Vec3{0,0,0});}}
  else{for(auto& [b,v]:frozenVelocity)if(shots.count(b))hb::Physics::SetVelocity(b,v);frozenVelocity.clear();}
}

void TopDownShooter::UpdateMenu(){
  // Esc 메뉴: W·S로 고르고 Enter·E·Space로 결정, A·D 또는 ◀▶로 효과음 크기. 마우스는 줄을 바로 누름 (계속하기=Esc, 메인 화면으로=F12)
  // 줄: 0 계속하기 · 1 배경음 · 2 효과음 · 3 메인 화면으로. ◀▶ 버튼은 배경음 -/=, 효과음 [/]
  static const char* keys[]={"w","s","a","d","enter","e","space","[","]","-","="};
  int down=0;for(int i=0;i<11;++i)if(hb::Input::IsKeyDown(keys[i]))down|=1<<i;
  const int pressed=down&~menuHeld;menuHeld=down;
  if(pressed&1)menuPick=(menuPick+3)%4;
  if(pressed&2)menuPick=(menuPick+1)%4;
  const int sfx=(pressed&256||(menuPick==2&&pressed&8))?1:(pressed&128||(menuPick==2&&pressed&4))?-1:0;
  const int mus=(pressed&1024||(menuPick==1&&pressed&8))?1:(pressed&512||(menuPick==1&&pressed&4))?-1:0;
  if(sfx){SfxLevel=std::clamp(SfxLevel+sfx,0,10);Sfx("Select");}
  if(mus){const int was=MusicLevel;MusicLevel=std::clamp(MusicLevel+mus,0,10);if(MusicLevel!=was)PlayBgm(BgmName());}  // 엔진은 틀 때만 크기를 정하므로 새 크기로 다시 틂
  if(pressed&(1|2))Sfx("Select");
  if(pressed&(16|32|64)){if(menuPick==0){SetPaused(false);return;}if(menuPick==3){ResetToTitle();return;}}
  UiPosition("MenuSelect",hb::Vec2{0,-75.f+menuPick*66});
  UiText("MenuMusic","배경음  "+std::string(MusicLevel,'|')+std::string(10-MusicLevel,'.'));
  UiText("MenuVolume","효과음  "+std::string(SfxLevel,'|')+std::string(10-SfxLevel,'.'));
  static const char* rows[]={"MenuResume","MenuMusic","MenuVolume","MenuQuit"};
  for(int i=0;i<4;++i)UiColor(rows[i],i==menuPick?hb::Color{1,0.835f,0.416f,1}:hb::Color{0.965f,0.925f,0.847f,1});
}

void TopDownShooter::Bag(bool toggle,bool use){
  // 가방 (기획서 7장 Tab): 들고 있는 소재·아이템과 적재량. [귀환]이 있으면 Enter로 사용 (던전 안에서만)
  // 칸 배치는 tools/gen_hud.py: 위 줄 소재·아이템 6칸(아이콘·개수·이름), 아래 줄 무기·각인·[귀환], 적재량 막대
  static const std::vector<std::string> parts=[]{std::vector<std::string> v={"BagPanel","BagTitle","BagHint","BagGearTitle",
      "BagWeightText","BagWeightBack","BagWeight","BagUseText"};
    for(int i=0;i<6;++i)for(auto* p:{"BagSlot","BagIcon","BagCount","BagName"})v.push_back(p+std::to_string(i));
    for(int k=0;k<3;++k)for(auto* p:{"BagGearSlot","BagGearIcon","BagGearBadge","BagGearName"})v.push_back(p+std::to_string(k));
    return v;}();
  if(toggle){bagOpen=!bagOpen;Sfx("Open",bagOpen?1.f:0.85f);if(bagOpen&&craftOpen)Craft(true,0,false);
    for(const auto& n:parts)UiVisible(n,bagOpen);UiVisible("BagUseTouch",bagOpen&&HasReturnItem);}
  const bool canReturn=HasReturnItem&&!Returning&&!ReturnSuccess&&inDungeon&&area>=0;
  if(bagOpen){
    const int counts[]={Ore,Herb,Monster,Bottle,Flashbangs,Gold};
    for(int i=0;i<6;++i){const auto k=std::to_string(i);UiText("BagCount"+k,std::to_string(counts[i]));UiOpacity("BagIcon"+k,counts[i]>0?1.f:0.3f);}  // 없는 건 흐리게
    static const char* weaponIcons[]={"sword","bow","card"};static const char* crystals[]={"","crystal_power","crystal_burn","crystal_pierce"};
    static const char* enchantNames[]={"각인 없음","증폭","화상",""};
    UiTexture("BagGearIcon0",std::string("Assets/UI/Items/")+weaponIcons[Character]+".png");
    UiText("BagGearBadge0",WeaponLevel?"+"+std::to_string(WeaponLevel):"");UiText("BagGearName0",weapons[Character]);
    UiVisible("BagGearIcon1",Enchant>0);if(Enchant>0)UiTexture("BagGearIcon1",std::string("Assets/UI/Items/")+crystals[Enchant]+".png");
    UiText("BagGearName1",Enchant==3?(Character?"관통":"검기"):enchantNames[Enchant]);
    UiVisible("BagGearIcon2",HasReturnItem);UiOpacity("BagGearIcon2",canReturn?1.f:0.45f);UiText("BagGearName2",HasReturnItem?"[귀환]":"없음");
    const bool heavy=Weight()>rules->WeightLimit;
    UiText("BagWeightText","적재량 "+std::to_string(Weight())+" / "+std::to_string(rules->WeightLimit)+(heavy?"  무거워서 느림":""));
    UiColor("BagWeightText",heavy?hb::Color{1,0.54f,0.48f,1}:hb::Color{0.96f,0.93f,0.85f,1});
    UiValue("BagWeight",std::min(1.f,float(Weight())/std::max(1,rules->WeightLimit)));
    UiText("BagUseText",HasReturnItem?(canReturn?"Enter·[귀환] 누르기: 집으로":"[귀환]은 던전 안에서 써"):"");}
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

// ---- 살아 있는 맵: 장면에 놓인 생물·구름 그늘을 움직인다 ----------------------------------
// 흔들리는 나무·풀, 깜빡이는 빛, 연기·잎·먼지 입자는 엔진(Animator·ParticleSystem)이 알아서 돌린다 (tools/gen_scene.py).
// 여기서는 플레이어에 반응하거나 길을 따라 움직이는 것만: 태그 Ambient.Bird·Butterfly·Cloud(거점), Ambient.Bat·Rat(던전)
//   새: 땅에서 쪼다가 가끔 콩콩 뛰고, 플레이어가 다가오거나 공격하면 날아가 화면 밖에서 사라진 뒤 안 보이는 곳에 다시 내려앉음
//   나비: 꽃 둘레를 8자로 팔랑임 / 구름 그늘: 거점 위를 천천히 흘러감
//   박쥐: 지금 방을 가끔 가로질러 날아감 / 쥐: 방 벽을 따라 쪼르르 달리다 사라짐

namespace {
const char* kTags[]={"Ambient.Bird","Ambient.Butterfly","Ambient.Cloud","Ambient.Bat","Ambient.Rat"};
float Rand(float a,float b){return a+(b-a)*float(std::rand()%10000)/10000.f;}
const hb::Vec3 kParked{0,-400,0};
}

void TopDownShooter::UpdateAmbient(float delta,const hb::Vec3& at,bool attacking){
  if(!ambientReady){ambientReady=true;
    for(int kind=0;kind<5;++kind)for(auto* a:hb::Scene::GetActorsWithTag(kTags[kind])){
      Critter c;c.a=a;c.kind=kind;c.home=c.at=hb::Scene::GetPosition(a);c.timer=Rand(0.5f,4.f);c.t=Rand(0,10);
      if(kind>=3){c.at=kParked;hb::Scene::SetPosition(a,kParked);c.timer=Rand(3,10);}  // 던전 생물은 숨겨 두고 가끔 나옴
      critters.push_back(c);}}
  if(critters.empty())return;
  const float vh=rules->CameraSize,vw=vh*16.f/9.f;
  auto visible=[&](const hb::Vec3& p){return std::abs(p.x-cameraAt.x)<vw+1&&std::abs(p.y-cameraAt.y)<vh+1;};
  for(auto& c:critters){
    c.t+=delta;c.timer-=delta;
    switch(c.kind){
    case 0:{  // 새
      const float near=Length(c.at-at);
      if(c.state==0){  // 땅: 쪼기 (애니메이션은 장면의 Animator), 가끔 뜀, 가까이 오면 날아감
        if(near<2.6f||(attacking&&near<5)){c.state=1;c.vel=Normal(c.at-at,hb::Vec3{1,0,0})*5+hb::Vec3{0,3.5f,0};c.timer=3;
          hb::Sprites::PlayAnimation(c.a,"Assets/Animations/SA_BirdFly.hbspriteanimation.json",true);
          hb::Sprites::SetFlip(c.a,c.vel.x<0,false);break;}
        if(c.timer<=0){c.timer=Rand(1.5f,4.f);const hb::Vec3 hop{Rand(-0.5f,0.5f),Rand(-0.3f,0.3f),0};
          if(Length(c.at+hop-c.home)<2.5f){c.at=c.at+hop;hb::Scene::SetPosition(c.a,c.at);hb::Sprites::SetFlip(c.a,hop.x<0,false);}}}
      else if(c.state==1){  // 날아감: 위로 휘며 빨라짐 → 화면 밖이면 숨김
        c.vel=c.vel*(1+delta*0.6f)+hb::Vec3{0,delta*2,0};c.at=c.at+c.vel*delta;hb::Scene::SetPosition(c.a,c.at);
        if(c.timer<=0||!visible(c.at)){c.state=2;c.timer=Rand(6,14);hb::Scene::SetPosition(c.a,kParked);}}
      else if(c.timer<=0){  // 다시 앉기: 원래 자리 근처가 화면 밖이고 플레이어와 멀 때만 (갑자기 생기는 게 보이지 않게)
        const hb::Vec3 spot=c.home+hb::Vec3{Rand(-1.5f,1.5f),Rand(-1,1),0};
        if(!visible(spot)&&Length(spot-at)>8){c.state=0;c.at=spot;hb::Scene::SetPosition(c.a,spot);
          hb::Sprites::PlayAnimation(c.a,"Assets/Animations/SA_BirdIdle.hbspriteanimation.json",true);}
        else c.timer=2;}
      break;}
    case 1:{  // 나비: 집 둘레 8자
      if(!visible(c.home))break;
      const hb::Vec3 p=c.home+hb::Vec3{std::sin(c.t*0.9f)*1.3f,std::sin(c.t*1.8f)*0.5f+0.6f+std::sin(c.t*5.3f)*0.08f,0};
      if((p.x<c.at.x)!=c.flip){c.flip=p.x<c.at.x;hb::Sprites::SetFlip(c.a,c.flip,false);}
      c.at=p;hb::Scene::SetPosition(c.a,p);break;}
    case 2:{  // 구름 그늘: 동쪽으로 흐르고 거점 동쪽 끝을 지나면 서쪽에서 다시
      if(int(c.t*20)%3)break;  // 아주 느리니 세 번에 한 번만 옮김
      c.at.x=c.home.x+std::fmod(c.t*0.35f+1000,110.f);if(c.at.x>66)c.at.x-=110;
      hb::Scene::SetPosition(c.a,c.at);break;}
    case 3:{  // 박쥐: 방 하나를 가로질러 날아감
      if(area<0||area>=(int)map.rooms.size()||fightingRoom>=0&&c.state==0)break;  // 싸우는 중엔 새로 나오지 않음
      const auto& room=map.rooms[area];
      if(c.state==0&&c.timer<=0){c.state=1;const bool left=std::rand()%2;
        c.at={left?room.cx-room.hw-1:room.cx+room.hw+1,room.cy+Rand(-room.hh*0.6f,room.hh*0.8f),0.5f};c.vel={left?6.f:-6.f,Rand(-0.6f,0.6f),0};
        c.home=c.at;c.t=0;hb::Sprites::SetFlip(c.a,!left,false);}
      if(c.state==1){c.at=c.at+c.vel*delta;const hb::Vec3 p=c.at+hb::Vec3{0,std::sin(c.t*7)*0.35f,0};hb::Scene::SetPosition(c.a,p);
        if(std::abs(c.at.x-room.cx)>room.hw+2){c.state=0;c.timer=Rand(8,20);hb::Scene::SetPosition(c.a,kParked);}}
      break;}
    case 4:{  // 쥐: 북쪽 벽 밑을 따라 달리다 사라짐
      if(area<0||area>=(int)map.rooms.size())break;
      const auto& room=map.rooms[area];
      if(c.state==0&&c.timer<=0&&fightingRoom<0){c.state=1;const bool right=std::rand()%2;
        c.at={room.cx+Rand(-room.hw*0.7f,room.hw*0.7f),room.cy+room.hh-0.35f,0};c.vel={right?4.5f:-4.5f,0,0};c.timer=Rand(0.8f,1.4f);
        hb::Sprites::SetFlip(c.a,!right,false);}
      if(c.state==1){c.at=c.at+c.vel*delta;hb::Scene::SetPosition(c.a,c.at);
        if(c.timer<=0||Length(c.at-at)<1.5f){c.state=0;c.timer=Rand(10,25);hb::Scene::SetPosition(c.a,kParked);}}
      break;}
    }
  }
}

// 같은 컴파일 단위로 묶는 역할별 파일 (엔진 C++ 빌드는 .cpp마다 엔진 헤더를 다시 읽어 60초 한도에 걸림, docs/엔진_요청_C++빌드시간.md)
#include "Interact.inl"   // 상호작용(E)·제작(Q)
#include "Screen.inl"     // HUD·캐릭터 그림·대화창·인트로·타이틀
