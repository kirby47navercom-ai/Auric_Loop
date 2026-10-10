#include "Common.h"
#include <algorithm>
#include <map>
#include <random>
#include <set>
#include <sstream>
#include <string>

// 수치 근거: docs/데모_기획서.md 4·5·6장. 값은 BP 기본값(편집기 속성)에서 고친다.

TopDownShooter* TopDownShooter::Current=nullptr;

void TopDownShooter::MoveCamera(const hb::Vec3& position,const hb::Vec3& aim,bool hasAim,float delta){
  // 엔터 더 건전·소울 나이트처럼 조준 쪽으로 끌려가며 부드럽게 따라간다
  if(!camera)return;
  hb::Vec3 target=position;
  if(hasAim)target=target+hb::VectorMath::ClampVectorLength((aim-position)*rules->CameraLead,rules->CameraLeadMax);
  // 던전 방 안에서는 방 기준: 방이 화면에 다 들어가면 방 가운데에 고정, 크면 벽 밖이 보이지 않게 가둠. 복도에서는 플레이어를 따라감
  if(inDungeon&&cutscene<=0){const int r=map.RoomAt(position);
    if(r>=0){const auto& room=map.rooms[r];const float vh=rules->CameraSize,vw=vh*16.f/9.f,pad=rules->CameraRoomPad;
      auto fit=[](float t,float c,float half,float view){return half<=view?c:std::clamp(t,c-half+view,c+half-view);};
      target.x=fit(target.x,room.cx,room.hw+pad,vw);target.y=fit(target.y,room.cy,room.hh+pad,vh);}}
  else if(!inDungeon&&camMax.x>camMin.x){const float vh=rules->CameraSize,vw=vh*16.f/9.f;  // 거점·원룸: 맵 바깥이 안 보이게
    auto fit=[](float t,float lo,float hi,float view){return hi-lo<=2*view?(lo+hi)/2:std::clamp(t,lo+view,hi-view);};
    target.x=fit(target.x,camMin.x,camMax.x,vw);target.y=fit(target.y,camMin.y,camMax.y,vh);}
  target.z=hb::Scene::GetPosition(camera).z;
  if(!cameraReady){cameraAt=target;cameraReady=true;}else cameraAt=hb::VectorMath::VInterpTo(cameraAt,target,delta,cutscene>0?14.f:rules->CameraFollow);  // 컷신은 빠르게 보스를 잡음
  auto at=cameraAt;
  at=at+kick;kick=kick*std::exp(-delta*14);  // 때린 방향으로 밀렸다 빠르게 돌아옴
  if(shake>0){shake-=delta;const float a=rules->ShakeAmount*shakePower;if(shake<=0)shakePower=1;at.x+=a*(std::rand()%201-100)/100;at.y+=a*(std::rand()%201-100)/100;}  // 때렸을 때 흔들림
  hb::Scene::SetPosition(camera,at);
  if(inDungeon)map.FollowBackdrop(at);
}

// ---- 한 프레임 ------------------------------------------------------------------------

void TopDownShooter::Update(float delta){
  Current=this;
  if(hitStopLeft>0){hitStopLeft-=delta/std::max(0.0001f,hb::Clock::TimeScale());  // 히트스톱은 실제 시간으로 셈 (게임 시간은 느려져 있으므로)
    if(hitStopLeft<=0&&!Paused)hb::Clock::SetTimeScale(1.f);}
  player=hb::Gameplay::GetPlayerPawn();if(!player)return;
  frame++;if(hudDirty)Hud();
  {// 성능 확인: F3으로 왼쪽 위에 초당 게임 프레임과 0.5초 동안 가장 긴 프레임
   const bool f3=hb::Input::IsKeyDown("F3");if(f3&&!fpsHeld){ShowFps=!ShowFps;if(player&&frame>=2)UiVisible("Fps",ShowFps);}fpsHeld=f3;
   fpsTime+=delta;fpsFrames++;fpsWorst=std::max(fpsWorst,delta);
   if(fpsTime>=0.5f){if(ShowFps&&player&&frame>=2){UiVisible("Fps",true);
       UiText("Fps",std::to_string(int(fpsFrames/fpsTime+0.5f))+" FPS");}
     fpsTime=0;fpsFrames=0;fpsWorst=0;}}
  if(minimapDirty&&frame>=2){minimapDirty=false;UpdateMinimap();}  // 위젯은 첫 프레임 뒤에 생김
  if(!started)Begin();
  if(leaving)return;
  playerAt=hb::Scene::GetPosition(player);
  const auto position=playerAt;
  {// 배경음: 거점·던전·보스방·귀환
   const std::string music=BgmName();
   if((Phase>=2||selecting)&&music!=currentMusic)PlayBgm(music);}  // 첫 입력 전이면 엔진이 기다렸다 틂
  {// 부스 운영 (기획서 10장): F12 바로 처음으로, 엔딩 카드에서 아무 키나 누르면 처음으로 (무입력 자동 복귀는 테스트에 불편해서 뺌)
   bool any=hb::VectorMath::Vector2Length(hb::Input::GetMouseDelta())>0;
   for(auto* k:{"w","a","s","d","e","q","space","enter","tab","LeftMouseButton","1","2","3","4","5"})any=any||hb::Input::IsKeyDown(k);
   const bool anyPressed=any&&!anyHeld;anyHeld=any;idleTime=any?0:idleTime+delta;
   if(hb::Input::IsKeyDown("F12")||(ending&&(anyPressed||AnyPressed(true)))){ResetToTitle();return;}
   if(ending)return;
   if(Phase>=2&&!Returning&&!ReturnSuccess&&area>=0&&roomKind!="Boss"){runTime+=delta;
     if(runTime>=rules->RunNotice){  // 10분이 지나면 운영자가 F10으로 보스방 앞으로 (화면 안내는 없음)
       if(hb::Input::IsKeyDown("F10")&&inDungeon){runTime=0;hint="";Warp(map.PathRoom(map.rooms[map.boss].path-1));}}}
   // 부스 운영자: F9로 주 경로 다음 방으로 (귀환 중이면 시작 방 쪽으로)
   const bool warp=hb::Input::IsKeyDown("F9");
   if(warp&&!warpHeld&&inDungeon&&area>=0){const int order=map.rooms[area].path+(Returning?-1:1);Warp(map.PathRoom(std::max(0,order)));}
   warpHeld=warp;}
  hb::Vec3 aim;const bool hasAim=hb::Input::GetMouseWorldPosition(hb::Vec3{0,0,1},position,aim);
  // 모바일 공격 버튼은 K. 터치 위치는 조준이 아니라서 자동 조준·바라보는 방향으로 카메라를 끈다
  touchMode=hb::Input::GetLastDevice()=="touch";  // 모바일 공격 버튼도 LeftMouseButton. 마지막 입력 장치로 자동 조준을 정함
  if(cutscene>0){  // 보스 등장 컷신: 카메라가 보스(나타나기 전엔 나올 자리)를 빠르게 잡고 살짝 확대
    hb::Vec3 at=cutsceneAt;for(auto* e:Enemies())if(e->Boss){at=hb::Scene::GetPosition(e);at.y+=0.6f;}
    MoveCamera(at,at,false,delta);cutZoom=std::max(0.72f,cutZoom-delta*0.8f);}
  else if(cutZoom<1)cutZoom=std::min(1.f,cutZoom+delta*1.5f);  // 끝나면 원래 크기로
  {punch=std::max(0.f,punch-delta*4);const float ortho=rules->CameraSize*cutZoom*(1-0.05f*punch);  // 처치·크리티컬 순간 살짝 확대
   if(camera&&std::abs(ortho-lastOrtho)>0.001f){lastOrtho=ortho;hb::Components::SetFloat(camera,"Camera","orthographicSize",ortho);}}
  if(chainTime>0)chainTime-=delta;
  else if(cutscene<=0)MoveCamera(position,touchMode?position+facing*(rules->CameraLeadMax/rules->CameraLead*0.5f):aim,(hasAim||touchMode)&&Phase>=2,delta);  // 컷신 중엔 위에서 보스를 비춘 카메라를 다시 플레이어 쪽으로 끌지 않게 (둘 사이 빈 바닥만 보였음)
  if(!Paused)UpdateAmbient(delta,position,Phase>=2&&hb::Input::IsKeyDown("LeftMouseButton"));
  {const bool adv=hb::Input::IsKeyDown("e")||hb::Input::IsKeyDown("LeftMouseButton")||hb::Input::IsKeyDown("enter")||hb::Input::IsKeyDown("space");
   const bool pressed=adv&&!advanceHeld;advanceHeld=adv;
   if(frame>=2&&UpdateIntro(delta,pressed||AnyPressed(true)))return;
   {const bool p=hb::Input::IsKeyDown("escape")||hb::Input::IsKeyDown("p");  // 일시정지 (Esc·P)
    if(p&&!pauseHeld&&Phase>=2&&settleTime<0&&!ending&&cutscene<=0){
      // Esc: 열린 창을 위에서부터 하나씩 닫고, 다 닫혀 있을 때만 메뉴
      if(!Paused&&craftOpen)Craft(true,0,false);else if(!Paused&&bagOpen)Bag(true,false);
      else if(!Paused&&mapOpen){mapOpen=false;DrawMap(false);}else SetPaused(!Paused);}
    pauseHeld=p;  // 보스 등장 중엔 메뉴도 안 열림
    if(Paused){if(!leaving)UpdateMenu();return;}}
   if(tipTime>0&&(tipTime-=delta)<=0){UiVisible("TipBack",false);UiVisible("Tip",false);}
   if(cutscene>0){  // 보스 등장: 1초 마법진 → 보스 → 1.3초 포효(흔들림)·이름 자막 → 끝나면 대사
     cutscene-=delta;hb::Physics::SetVelocity(player,hb::Vec3{0,0,0});
     if(sentSpeed!=0){sentSpeed=0;hb::Movement2D::SetSpeed(player,0);}  // 이동 컴포넌트가 키로 움직이지 않게 (컷신 동안 모든 조작 막음)
     UpdateFx(delta);  // 등장 마법진 등 이펙트도 제때 사라지게 (안 그러면 컷신 내내 보스 몸 위에서 빛남)
     if(inDungeon)UpdateWaves(delta);  // 보스는 컷신 0.5초 만에 나와야 함 (아래 return 때문에 컷신이 끝나야 나와서 빈 방만 비췄음)
     if(!roared&&cutscene<1.9f){roared=true;Shake(0.7f,1.8f);Sfx("BossCharge");hb::Camera::Flash(hb::Color{1,0.85f,0.4f,0.12f},0.2f);  // 번쩍임은 약하게 (보스가 묻히지 않게)
       for(auto* e:Enemies())if(e->Boss){UiText("BossName",e->DisplayName);UiText("BossSub","황금에 잠식된 1층의 문지기");e->Roar(1.6f);}
       for(auto* n:{"BossName","BossSub"})UiVisible(n,true);}
     if(cutscene<=0){for(auto* n:{"CineTop","CineBottom","BossName","BossSub"})UiVisible(n,false);
       sentSpeed=-1;dodgeHeld=flashHeld=true;attackCooldown=0.3f;advanceHeld=true;}  // 끝: 이동 속도 되돌림, 컷신 중 누르고 있던 키가 바로 동작하지 않게
     return;}
   if(bannerTime>0&&(bannerTime-=delta)<=0)UiVisible("BossSub",false);
   if(hintTime>0&&(hintTime-=delta)<=0){hint="";Hud();}
   {const bool m=hb::Input::IsKeyDown("m");const bool arrive=bannerPending&&frame>=2&&dialogIndex>=dialog.size()&&settleTime<0;  // 대화가 끝난 뒤에
    const bool toggle=m&&!mapHeld;mapHeld=m;
    if(toggle&&inDungeon){mapOpen=!mapOpen;DrawMap(mapOpen);Sfx("Select");}  // 던전: M·미니맵을 누르면 큰 지도 + 지역 이름 (다시 누르면 닫힘)
    AreaBanner(delta,(toggle&&!inDungeon)||arrive);if(arrive)bannerPending=false;  // 도착하면 한 번 (거점엔 지도가 없어 M이면 이름만)
    UpdateMapLayer();}
   if(UpdateSettle(delta,pressed)){flashHeld=true;dodgeHeld=true;attackCooldown=0.2f;hb::Physics::SetVelocity(player,hb::Vec3{0,0,0});return;}
   if(UpdateDialog(delta,pressed||AnyPressed(false))){flashHeld=true;dodgeHeld=true;attackCooldown=0.2f;hb::Physics::SetVelocity(player,hb::Vec3{0,0,0});return;}}  // 대화 중엔 행동·이동 막음
  if(!inDungeon&&!inHome&&Phase>=2&&settleTime<0)Tip(0);  // 거점: 북쪽 계단으로 (오프닝 대화가 끝난 뒤)
  if(inHome){if(position.y<exitY){Leave(-1,"HomeDoor");return;}}  // 원룸 문 → 거점 집 앞
  else if(!inDungeon){  // 거점 계단 끝 → 던전 (들어갈 때마다 새 층). 계단에 막 도착했으면 한 번 내려와야 다시 들어감 (W를 누른 채 왔다 갔다 방지)
    if(position.y<exitY-2)exitArmed=true;
    if(exitArmed&&position.y>exitY){Leave(0,"");return;}}
  else{
    // 시작 방 계단에 닿으면 거점으로 (귀환 중이면 귀환 성공)
    if(map.stairs&&fightingRoom<0){const auto s=hb::Scene::GetPosition(map.stairs);  // 계단 아랫변(벽 밑) 앞에 서면 거점으로
      if(std::fabs(s.x-position.x)<1.2f&&position.y-0.95f>s.y-2-0.7f&&position.y-0.95f<s.y){Leave(-1,"StairTop");return;}}
    const int at=map.RoomAt(position);
    if(at>=0&&at!=area){area=at;RoomIndex=at;roomKind=map.rooms[at].kind;
      map.Show(at);Layout=map.Describe().dump();  // 내 주변 방만 깔기
      auto& r=map.rooms[at];r.visited=r.seen=true;for(int d=0;d<4;++d)if(r.link[d]>=0)map.rooms[r.link[d]].seen=true;
      UpdateMinimap();Hud();}
    if(at>=0&&map.rooms[at].Inside(position,rules->EnterDepth)){
      if(Returning)StartReturnRoom(at);else if(!ReturnSuccess)EnterRoom(at);}
  }

  std::vector<Enemy*> enemies;
  {const auto all=Enemies();Separate(all,position);  // 겹침은 속도로 벌린다 (위치를 직접 옮기면 매 프레임 엔진 명령이 늘어 느려짐)
  for(auto* e:all){e->Tick(delta);KeepInside(e);  // 적 이동은 여기서 한 번에 (상태 머신은 상태가 바뀔 때만 C++를 부름)
    if(e->burnedOut){e->burnedOut=false;KillEnemy(e);}else enemies.push_back(e);}  // 화상으로 쓰러짐
  }
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
  if(moving&&dodgeTimer<=0){if((stepTime-=delta)<=0){stepTime=0.32f;Sfx("Step",0.9f+float(std::rand()%20)/100);}}else stepTime=0.05f;  // 발소리
  // 적재량 초과·피로도 75% 이상이면 이동속도 -25% (기획서 4-1)
  // 공격·활 당기기 중 이동속도 배율 (그림은 걸으며 공격하는 합성 그림이라 멈출 필요는 없음)
  // 새 시트: 발렌은 베는 동안 이동 키를 받지 않고 그림의 내딛기만큼만 나감, 겨눈 채 뒷걸음질은 더 느리게
  const bool backpedal=moving&&hb::VectorMath::DotProduct(move,facing)<-0.3f;
  {const float act=NewSheet()&&Character==0&&attackAnim>0?0.f
     :Character==0&&attackAnim>0?rules->AttackMoveRate
     :Character==1&&charge>0?(NewSheet()&&backpedal?rules->BackpedalRate:rules->ChargeMoveRate)
     :NewSheet()&&Character==2&&attackDown&&backpedal?rules->ChargeMoveRate:1.f;
   const float speed=act*rules->MoveSpeed*((Weight()>rules->WeightLimit||Fatigue*4>=FatigueMax*3)?rules->SlowRate:1.f);
   if(speed!=sentSpeed){sentSpeed=speed;hb::Movement2D::SetSpeed(player,speed);}}
  attackCooldown-=delta;dodgeCooldownLeft-=delta;invulnerable-=delta;

  // 회피: Space를 누른 순간 바라보는 방향으로 대시, 대시 중 무적
  const bool dodgeDown=hb::Input::IsKeyDown("space")||hb::Input::IsKeyDown(" ");
  if(dodgeDown&&!dodgeHeld&&dodgeCooldownLeft<=0&&dodgeTimer<=0){dodgeTimer=rules->DodgeTime;dodgeCooldownLeft=rules->DodgeCooldown;Sfx("Dodge");
    if(moving)facing=hb::VectorMath::NormalizeVector(move);  // 걷던 쪽으로 (조준 중이어도)
    Blink(position);}
  dodgeHeld=dodgeDown;
  if(dodgeTimer>0)dodgeTimer-=delta;  // 순간이동 뒤 잠깐 무적
  else if(NewSheet()&&Character==0&&attackAnim>0.12f&&attackAnim<=0.22f)hb::Physics::SetVelocity(player,facing*(rules->SlashStep/0.1f));  // 베기 프레임 동안 한 발 내딛음
  else if(knockTimer>0){knockTimer-=delta;hb::Physics::SetVelocity(player,knock);}
  {const bool blink=invulnerable>0&&int(invulnerable*12)%2==0;  // 무적 시간 깜빡임
   if(blink!=blinkShown){blinkShown=blink;const float v=blink?0.4f:1.f;hb::Sprites::SetColor(player,hb::Color{v,v,v,1});}}  // 투명도를 바꾸면 렌더 재질을 다시 만들어 끊김

  // 가방 (Tab): 열고 닫기, 열린 채 Enter면 [귀환] 사용. 귀환 중 섬광탄 (E): 제작한 것 먼저, 없으면 골드
  const bool tab=hb::Input::IsKeyDown("tab");
  {const bool enter=hb::Input::IsKeyDown("enter");Bag(tab&&!returnHeld,enter&&!confirmHeld&&bagOpen);}
  returnHeld=tab;
  const bool flash=hb::Input::IsKeyDown("e");
  if(!Returning)Interact(position,flash&&!flashHeld);
  else{promptTarget=nullptr;
    if(flash&&!flashHeld&&(Flashbangs>0||Gold>=rules->FlashPrice)){if(Flashbangs>0)Flashbangs--;else Gold-=rules->FlashPrice;StunAll(rules->FlashStun);Sfx("Flash");
      ClearBullets();Hud();}}
  UpdatePrompt(delta);
  flashHeld=flash;
  {const bool q=hb::Input::IsKeyDown("q"),enter=hb::Input::IsKeyDown("enter");int which=0;
   for(int i=1;i<=5;++i)if(hb::Input::IsKeyDown(std::to_string(i)))which=i;
   Craft(q&&!craftKeyHeld,which,enter&&!confirmHeld);craftKeyHeld=q;confirmHeld=enter;}

  // 공격: 발렌 검 베기, 셰리 당겼다 떼서 쏘는 활, 알레아 마탄 연사
  if(Character==1){  // 누르는 동안 당기고(1초면 다 당김, 그 뒤로는 유지) 떼는 순간 발사. 덜 당기고 떼면 취소
    if(attackDown&&attackCooldown<=0){const bool full=charge>=rules->ArrowCharge;charge=std::min(charge+delta,rules->ArrowCharge);
      if(!full&&charge>=rules->ArrowCharge){hb::Sprites::Flash(player,0.08f,0.5f);Sfx("Select");}}
    else if(!attackDown&&charge>0){  // 떼는 순간 발사: 당긴 정도(0~1)에 따라 피해·속도·문 타격이 커짐. 너무 짧게 떼면 취소
      if(charge>=rules->ArrowMinCharge){const float power=std::min(1.f,charge/rules->ArrowCharge);Shoot(position,power);attackAnim=0.1f;
        attackCooldown=0.15f+(power<1?rules->ArrowPartialCooldown*(1-power*0.5f):0.f);}  // 다 당기지 않았으면 쉬는 시간 (연타 방지)
      charge=0;}}
  else if(Character==2&&attackDown&&attackCooldown<=0){attackCooldown=rules->BoltInterval;attackAnim=0.2f;Shoot(position);}
  else if(Character==0&&attackDown&&!swordHeld&&attackCooldown<=0){swordHeld=true;Slash(position,enemies);}  // 발렌: 누를 때마다 한 번 (꾹 눌러 연속 베기 없음)
  if(!attackDown)swordHeld=false;
  {const bool rmb=hb::Input::IsKeyDown("RightMouseButton");  // 섬광탄: 우클릭으로 마우스 쪽에 던짐 (최대 6m)
   if(rmb&&!throwHeld&&Flashbangs>0&&inDungeon){const hb::Vec3 d=hasAim&&!touchMode?aim-position:facing*4;const float l=std::min(6.f,Length(d));
     ThrowFlash(position+hb::Vec3{0,0.2f,0},position+Normal(d,facing)*l+hb::Vec3{0,-0.6f,0});}
   throwHeld=rmb;}
  if(inDungeon)UpdateGoldPiles(position);
  if(slashPending>0&&(slashPending-=delta)<=0)SlashHit(hb::Scene::GetPosition(player),enemies);
  UpdateShots(delta,enemies);

  // 골드: 가까이 가면 끌려와서 주워짐
  for(auto it=coins.begin();it!=coins.end();){auto* c=it->first;const auto d=position-hb::Scene::GetPosition(c);const float len=Length(d);
    float& age=coinAge[c];age+=delta;const bool fresh=age<0.6f;  // 떨어진 직후는 그 자리에 보이게
    if(!fresh&&len<rules->CoinPickup){if(it->second<0){Monster++;Sfx("Pickup");}else{Gold+=it->second;Sfx("Coin");}
      Effect("CoinSparkle",hb::Scene::GetPosition(c)+hb::Vec3{0,0.3f,0.3f},0,1.f);coinAge.erase(c);Give(coinPool,c);it=coins.erase(it);Hud();continue;}
    if(!fresh&&len<rules->CoinMagnet)hb::Scene::SetPosition(c,hb::Scene::GetPosition(c)+d*(std::min(1.f,delta*8)));
    ++it;}
  if(boss)BossHp=boss->Hp;
  {// 보스 체력 막대 (화면 위)
   const float ratio=boss&&boss->MaxHp>0?std::max(0.f,boss->Hp/boss->MaxHp):-1.f;
   if(ratio!=bossBarShown){if((ratio<0)!=(bossBarShown<0))for(auto* n:{"BossBarBack","BossBar","BossBarName"})UiVisible(n,ratio>=0);
     if(ratio>=0){UiValue("BossBar",ratio);if(bossBarShown<0)UiText("BossBarName",boss->DisplayName);}
     bossBarShown=ratio;}}
}

