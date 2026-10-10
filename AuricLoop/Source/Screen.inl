#pragma once  // World.cpp가 포함 (따로 컴파일하지 않음)
#include "Common.h"
#include <algorithm>
#include <map>
#include <random>
#include <set>
#include <sstream>
#include <string>

// ---- 화면 ----------------------------------------------------------------------------

void TopDownShooter::Hud(){
  // 위젯 인스턴스는 첫 프레임 뒤에 생기므로 그 전에는 표시만 미룬다. 요소 이름은 tools/gen_hud.py의 W_TopDown
  if(frame<2||!player){hudDirty=true;return;}
  hudDirty=false;
  if(Phase>=2&&!introHidden){introHidden=true;
    for(auto* n:{"LoadingBack","LoadingLogo","LoadingFade","TitleBack","TitleScreen"})UiVisible(n,false);TitleFx(0,false);}
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
  UiText("Hint",hint);UiVisible("HintBack",!hint.empty());UiVisible("Minimap",inDungeon);UiVisible("MapTouch",inDungeon);  // 알림 받침은 문구 있을 때만, 미니맵은 던전에서만
  UiValue("Fatigue",FatigueMax>0?std::min(1.f,float(Fatigue)/FatigueMax):1.f);
  // 위 가운데 칸은 진행 상태가 있을 때만 (지역 이름은 도착할 때 가운데에 크게: AreaBanner)
  const std::string status=Hp<=0?"":ReturnSuccess?"귀환 성공 - 정산 "+std::to_string(LastRepaid)+" G 상환"
    :Returning?"귀환 - 문 "+std::to_string(DoorHits)+"/"+std::to_string(rules->DoorHitsToOpen)+"  섬광탄 "+(Flashbangs?std::to_string(Flashbangs):std::to_string(rules->FlashPrice)+"G")
    :HasReturnItem?"[귀환] 획득 - Tab으로 사용":"";
  UiText("Title",status);UiVisible("Title",!status.empty());UiVisible("AreaBack",!status.empty());
}

static const char* kDirs8[]={"E","NE","N","NW","W","SW","S","SE"};
static int Sector(const hb::Vec3& v){return ((int)std::lround(Angle(v)/45)%8+8)%8;}

hb::Vec3 TopDownShooter::Muzzle(const hb::Vec3& from) const{
  // 새 시트는 방향마다 화살촉·카드 끝 픽셀을 기록해 둔다 (docs/캐릭터_시트_요청.md 9장). 192x96 그림, 원점은 발끝 0.95m 위
  static const char* names[]={"Valen","Sherry","Alea"};
  const std::string key=std::string(names[std::clamp(Character,0,2)])+"_"+kDirs8[Sector(facing)]+"=";
  for(const auto& m:rules->Muzzles)if(m.rfind(key,0)==0){const auto comma=m.find(',',key.size());if(comma==std::string::npos)break;
    const float px=std::stof(m.substr(key.size(),comma-key.size())),py=std::stof(m.substr(comma+1));
    static const float kHeroPPU[]={32,41,42};const float u=kHeroPPU[std::clamp(Character,0,2)];  // tools/scale_heroes.py (발끝은 그림 88번째 줄)
    return from+hb::Vec3{(px-96)/u,(88-0.95f*u-py)/u,0.25f};}
  return from+facing*0.8f+hb::Vec3{0,0.2f,0.25f};  // 몸이 1.6m로 작아져 손 앞 0.8m
}

void TopDownShooter::AnimateSheet(float delta,bool moving,const char* dir){
  // 새 시트: 8방향 그대로(반전 없음). 걷기 그림은 움직인 거리로 넘김 → 속도가 바뀌어도 발이 땅에 붙음
  // 다리 위상(0 오른발 디딤, 1 지나감, 2 왼발 디딤, 3 지나감)은 걷기·겨누고 걷기가 같이 쓰므로 공격으로 바뀌어도 다리가 이어짐
  if(playerFlipped){playerFlipped=false;hb::Sprites::SetFlip(player,false,false);}
  const auto at=hb::Scene::GetPosition(player);auto step=at-animPos;step.z=0;animPos=at;
  const float moved=Length(step)<1.f?Length(step):0.f;  // 순간이동(장면 전환·워프)은 걸음으로 안 셈
  const bool backward=moving&&hb::VectorMath::DotProduct(step,facing)<0;
  walkDist+=backward?-moved:moved;  // 뒷걸음질이면 위상을 거꾸로 (3→2→1→0)
  const int phase=((int)std::floor(walkDist/rules->Stride)%4+4)%4;
  const std::string d=std::string(dir)+"_";
  if(attackAnim>0)attackAnim-=delta;
  const bool busy=dodgeTimer>0||attackAnim>0||charge>0||moving||hb::Input::IsKeyDown("LeftMouseButton");
  stillTime=busy?0:stillTime+delta;
  std::string next;
  if(dodgeTimer>0){  // 구르기 5장 (0.3초 안에)
    const float t=rules->DodgeTime-dodgeTimer;next=d+"Roll_"+std::to_string(std::min(4,int(t/rules->DodgeTime*5)));fidget=0;}
  else if(Character==0&&attackAnim>0){  // 발렌: 내딛으며 베기 A/B (준비 0.08 → 베기 0.1 → 마무리 0.12)
    const float t=0.3f-attackAnim;next=d+(slashB?"SlashB_":"SlashA_")+std::to_string(t<0.08f?0:t<0.18f?1:2);fidget=0;
    if(attackAnim<=delta)walkDist=(slashB?0.f:2.f)*rules->Stride;}  // 끝나면 마지막 디딤발에 맞는 위상으로 걷기 이어감
  else if(Character==1&&(charge>0||attackAnim>0)){  // 셰리: 시위 걸기 → 다 당김 → 놓기, 걸으면 다리 위상 그대로
    const char* pose=charge<=0?"Loose":charge<rules->ArrowCharge*0.5f?"AimHalf":"AimFull";
    next=d+pose+(moving?"_W"+std::to_string(phase):std::string("_S"));fidget=0;}
  else if(Character==2&&(attackAnim>0||hb::Input::IsKeyDown("LeftMouseButton"))){  // 알레아: 겨눔, 던질 때마다 0.06초 튕김
    next=d+(attackAnim>0.14f?"Throw":"Hold")+(moving?"_W"+std::to_string(phase):std::string("_S"));fidget=0;}
  else if(moving){next=d+"Walk_"+std::to_string(phase);fidget=0;}
  else{
    if(phase%2)walkDist+=rules->Stride;  // 지나감 자세에서 멈추면 다음 디딤 자세로
    if(!fidget&&stillTime>=rules->FidgetDelay&&Character<(int)rules->Fidgets.size()){  // 대기 행동: 정면을 보고 셋 중 하나 (직전 것 빼고)
      do fidget=1+std::rand()%3;while(fidget==lastFidget);lastFidget=fidget;fidgetTime=0;facing=hb::Vec3{0,-1,0};}
    if(fidget){std::stringstream ss(rules->Fidgets[Character]);std::string n;int count=8;for(int i=0;i<fidget&&std::getline(ss,n,',');++i)count=std::stoi(n);
      fidgetTime+=delta;const int f=int(fidgetTime/0.16f);
      if(f<count)next="S_Fidget"+std::to_string(fidget)+"_"+std::to_string(f);
      else{fidget=0;stillTime=rules->FidgetDelay-(8+std::rand()%5);}}  // 다음은 8~12초 뒤
    if(next.empty()){breathTime+=delta;next=d+"Idle_"+std::to_string(int(breathTime*4)%std::max(1,rules->IdleFrames));}}
  if(next!=currentSprite){currentSprite=next;if(Character<(int)rules->CharacterSprites.size())hb::Sprites::SetSprite(player,rules->CharacterSprites[Character]+next+".hbsprite.json");}
}

#include "ValenSocket.inl"

void TopDownShooter::AnimateSocket(float delta,bool moving){
  // 발렌 (아트팀 이동 v14-1·공격 v5-1, tools/make_weapon_socket.py). 몸은 바라보는 쪽 4방향(반전 없음), 걸음 위상은 움직인 거리로 (뒷걸음질이면 거꾸로)
  // 다리: 바라보는 쪽과 45~135도 어긋나게 걸으면 옆걸음, 135도 넘으면 앞걸음 다리. 대시도 같은 달리기 그림
  // 검·손가락은 따로 그린 그림을 손 위치에 붙임: 평소엔 바라보는 쪽으로 돌린 검(64방향), 베는 0.32초 동안은 아트팀이 그린 8프레임 자세(조준 16방향)
  // 베는 동안 하체는 걷기 위상을 그대로 이어가고, 3~5번째 프레임에 검기가 몸 뒤에 나옴
  if(playerFlipped){playerFlipped=false;hb::Sprites::SetFlip(player,false,false);}
  const auto at=hb::Scene::GetPosition(player);auto step=at-animPos;step.z=0;animPos=at;
  const float moved=Length(step)<1.f?Length(step):0.f;
  const bool backward=hb::VectorMath::DotProduct(step,facing)<0;
  walkDist+=backward?-moved:moved;
  if(attackAnim>0)attackAnim-=delta;
  const bool go=moving||dodgeTimer>0;const int gait=go?1:0;
  const float aim=Angle(facing);  // 반시계, 0 = 오른쪽
  const int row=aim>=-45&&aim<45?3:aim>=45&&aim<135?2:aim>=-135&&aim<-45?0:1;
  const int phase=go?((int)std::floor(walkDist/0.48f)%4+4)%4:row==2?0:1;  // 달리기 한 걸음 0.48m, 서 있으면 1 (뒤는 0)
  int legs=0;  // 0 앞으로, 1 옆걸음 ccw, 2 옆걸음 cw (화면 시계 방향 기준: 조준 - 이동 > 0 이면 cw)
  if(go&&moved>0){const float d=std::fmod(aim-Angle(step)+540.f,360.f)-180;if(std::abs(d)>=45&&std::abs(d)<135)legs=d>0?2:1;}
  // 베기 프레임 (아트팀 55·40·30·40·45·40·35·35ms)
  int frame=-1;
  if(swingT>=0){swingT+=delta;float ms=swingT*1000;frame=0;while(frame<7&&ms>=kVsAttackMs[frame]){ms-=kVsAttackMs[frame];frame++;}
    if(swingT>=0.32f){swingT=-1;frame=-1;}}
  const int aimIdx=((int)std::floor((std::fmod(360.f-aim,360.f)+11.25f)/22.5f))%16;  // 화면 시계 방향 0=오른쪽, 22.5도씩
  vsRow=row;vsPhase=phase;vsLegs=legs;  // 대시 잔상이 지금 몸과 같은 그림을 쓰게
  const std::string dir="Assets/Sprites/ValenSocket/",g=go?"run_":"walk_",rp=std::to_string(row)+"_"+std::to_string(phase);
  const std::string body=frame<0?dir+"S_VS_"+g+std::to_string(legs)+"_"+rp+".hbsprite.json"
    :go?dir+"S_VS_A_run_"+std::to_string(legs)+"_"+rp+"_"+std::to_string(frame)+".hbsprite.json"
    :dir+"S_VS_A_walk_"+std::to_string(row)+"_"+std::to_string(frame)+".hbsprite.json";
  if(body!=currentSprite){currentSprite=body;hb::Sprites::SetSprite(player,body);}
  const hb::Vec3 lead=at+hb::Physics::GetVelocity(player)*delta;  // 이번 프레임 물리 이동만큼 앞질러 놓아 몸을 늦게 따라가지 않게
  if(grip){  // 손가락 덮개: 왼쪽을 보면 몸에 합쳐져 있으므로 치움
    const int ag=frame>=0?kVsAttackGrip[gait][row][phase][frame]:0;
    const std::string gs=row==1||ag<0?"":frame>=0?"S_VS_AG_"+std::to_string(ag):"S_VS_Grip_"+g+rp;
    const hb::Vec3 to=gs.empty()?hb::Vec3{0,-500,0}:lead;
    if(gs!=gripShown){gripShown=gs;if(!gs.empty())hb::Sprites::SetSprite(grip,dir+gs+".hbsprite.json");}
    if(Length(to-gripAt)>0.001f){gripAt=to;hb::Scene::SetPosition(grip,to);}}
  // 처음 한 번: 베기 그림 텍스처를 미리 읽어 둠 (검기는 0.115초만 보여서 처음 쓸 때 읽으면 첫 베기에 안 보임)
  if(!vsPreloaded&&frame<0){vsPreloaded=true;hb::Transform t;t.position=hb::Vec3{0,-800,0};
    for(auto* s:{"S_VS_Slash_0_3","S_VS_AW_0_F","S_VS_AG_0","S_VS_A_walk_0_0"})if(auto* a=Take(fxPool,rules->FxPrefab,t)){hb::Sprites::SetSprite(a,dir+s+".hbsprite.json");Give(fxPool,a);}}
  // 검기: 몸 뒤(순서 -1)에 발끝 12px 위를 가운데로, 1.8배 (호가 칼끝 바로 너머 약 2m, 판정 SwordRange 2.6m)
  {const bool show=frame>=2&&frame<=4;
   if(show&&!slashFx){hb::Transform t;t.position=at;slashFx=Take(fxPool,rules->FxPrefab,t);
     if(slashFx){hb::Sprites::SetSorting(slashFx,"default",-1);hb::Scene::SetScale(slashFx,hb::Vec3{1.8f,1.8f,1});}}
   if(slashFx){
     if(show){const std::string ss="S_VS_Slash_"+std::to_string(aimIdx)+"_"+std::to_string(frame);
       if(ss!=slashShown){slashShown=ss;hb::Sprites::SetSprite(slashFx,dir+ss+".hbsprite.json");}
       hb::Scene::SetPosition(slashFx,lead+hb::Vec3{0,-0.95f+12/kVsPPU,0.2f});}
     else{hb::Scene::SetScale(slashFx,hb::Vec3{1,1,1});hb::Sprites::SetSorting(slashFx,"default",4);Give(fxPool,slashFx);slashFx=nullptr;slashShown.clear();}}}
  if(!weapon)return;
  const bool rear=row==1||(aim>=45&&aim<=135);  // 왼쪽을 보면 검 든 손이 먼 쪽, 위를 겨누면 등 뒤
  const int* hand=frame>=0?kVsAttackHands[gait][row][phase][frame]:kVsHands[gait][row][phase];
  const hb::Vec3 to=lead+hb::Vec3{(hand[0]+0.5f-32)/kVsPPU,(kVsOriginTop-hand[1]-0.5f)/kVsPPU,0};  // 손 픽셀 가운데
  if(Length(to-weaponAt)>0.001f){weaponAt=to;hb::Scene::SetPosition(weapon,to);}
  const std::string side=rear?"R":"F";
  const std::string key=frame>=0?"S_VS_AW_"+std::to_string(kVsAttackWeapon[gait][row][aimIdx][phase][frame])+"_"+side
    :"S_VS_Sword_"+side+"_"+std::to_string((((int)std::lround(aim/5.625f))%64+64)%64);
  if(key!=weaponShown){weaponShown=key;hb::Sprites::SetSprite(weapon,dir+key+".hbsprite.json");}
}

void TopDownShooter::Animate(float delta,bool moving){
  // 8방향: 그림은 남·남동·동·북동·북 5방향이고 서쪽 셋은 동쪽 그림을 뒤집는다
  // 프레임: 공격 3장(0.1초씩) > 걷기 4장(초당 8장) > 서 있기
  static const char* dirs[]={"E","NE","N","NE","E","SE","S","SE"};
  if(Character==0){AnimateSocket(delta,moving);return;}
  if(weapon&&!weaponShown.empty()){weaponShown.clear();hb::Scene::SetPosition(weapon,hb::Vec3{0,-500,0});}  // 다른 캐릭터는 검·손가락을 치움
  if(grip&&!gripShown.empty()){gripShown.clear();hb::Scene::SetPosition(grip,hb::Vec3{0,-500,0});}
  const int sector=Sector(facing);
  if(NewSheet()){AnimateSheet(delta,moving,kDirs8[sector]);return;}
  const bool flip=sector>=3&&sector<=5;
  if(flip!=playerFlipped){playerFlipped=flip;hb::Sprites::SetFlip(player,flip,false);}
  std::string next=std::string(dirs[sector])+"_";
  if(attackAnim>0)attackAnim-=delta;
  if(dodgeTimer>0){  // 구르기: 웅크림 → 90·180·270도로 굴러 → 일어남 (서 있는 그림을 돌린 것, tools/unify_sprites.py). 그림은 아래·옆·위 셋
    static const int spin[]={1,2,4};
    const float t=rules->DodgeTime-dodgeTimer;const int f=t<0.08f?0:dodgeTimer<0.12f?3:spin[int((t-0.08f)/0.07f)%3];
    const char* row=sector==2||sector==1||sector==3?"N":sector>=5&&sector<=7?"S":"E";
    next=std::string(row)+"_Roll_"+std::to_string(f);}
  else if(charge>0||attackAnim>0){  // 셰리 장전(시위 걸기 → 당기기) 또는 공격 3장
    const int f=charge>0?(charge<rules->ArrowCharge*0.5f?0:1):attackAnim>0.2f?0:attackAnim>0.1f?1:2;
    // 공격 그림은 서서 하는 자세라 움직이는 중엔 윗몸은 공격·다리는 걷기인 합성 그림 (tools/make_walk_attack.py)
    if(moving){walkTime+=delta;next+="WalkAttack_"+std::to_string(f)+"_"+std::to_string(int(walkTime*10)%4);}
    else next+="Attack_"+std::to_string(f);}
  else if(moving){walkTime+=delta;next+="Walk_"+std::to_string(int(walkTime*10)%4);}
  else{walkTime=0;breathTime+=delta;next+="Idle_"+std::to_string(int(breathTime*1.6f)%2);}  // 서 있으면 숨쉬기 두 장
  if(next!=currentSprite){currentSprite=next;if(Character<(int)rules->CharacterSprites.size())hb::Sprites::SetSprite(player,rules->CharacterSprites[Character]+next+".hbsprite.json");}
}

static size_t Utf8Count(const std::string& s){size_t n=0;for(unsigned char ch:s)n+=(ch&0xC0)!=0x80;return n;}
static std::string Utf8Prefix(const std::string& s,size_t chars){size_t i=0,n=0;
  while(i<s.size()){if(((unsigned char)s[i]&0xC0)!=0x80){if(n==chars)break;n++;}i++;}return s.substr(0,i);}

bool TopDownShooter::UpdateDialog(float delta,bool advance){
  // 대화창 (기획서 6-5): 한 글자씩 → E·클릭·Enter로 바로 다 보이기 → 다시 누르면 다음 줄
  static const char* parts[]={"DialogBox","DialogNameTag","DialogPortraitFrame","DialogName","DialogText","DialogNext","DialogTouch"};
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
  }else if(shownChars<total){typeTime+=delta;const size_t next=std::min(total,size_t(typeTime*rules->TypeSpeed));if(next==shownChars)return true;
    const auto added=Utf8Prefix(l.text,next).substr(Utf8Prefix(l.text,shownChars).size());shownChars=next;
    if(added.find_first_not_of(" .,!?'\"-")!=std::string::npos)Sfx("Type",0.92f+0.16f*float(next%5)/4);}
  else return true;
  UiText("DialogText",Utf8Prefix(l.text,shownChars));
  UiVisible("DialogNext",shownChars>=total);
  return true;
}

void TopDownShooter::ShowSelect(bool visible){
  for(auto* n:{"SelectBack","SelectTitle","SelectConfirm"})UiVisible(n,visible);
  for(int i=0;i<3;++i){const std::string k=std::to_string(i);
    for(auto* n:{"SelectCard","SelectArt","SelectName","SelectWeapon","SelectDebt","SelectTouch"})UiVisible(n+k,visible);
    UiVisible("SelectPick"+k,visible&&i==pick);}
}

void TopDownShooter::AreaBanner(float delta,bool show){
  // 도착한 곳 이름: 가운데에 크게 0.4초 동안 나타나 2.2초 머물고 0.6초 동안 사라짐 (건전·소울 나이트처럼). M이나 미니맵을 누르면 다시
  static const char* parts[]={"AreaBannerBack","AreaBanner","AreaBannerSub","AreaBannerLine"};
  if(show&&Phase>=2){areaBannerTime=3.2f;
    UiText("AreaBanner",inHome?"원룸":inDungeon?"황금 던전":"빚쟁이 마을");
    UiText("AreaBannerSub",inHome?"Lv "+std::to_string(HomeLevel):inDungeon?"1층 - 마몬의 입 속":"거점");
    for(auto* n:parts)UiVisible(n,true);}
  if(areaBannerTime<=0)return;
  areaBannerTime-=delta;
  const float t=3.2f-areaBannerTime,a=areaBannerTime<=0?0.f:t<0.4f?t/0.4f:areaBannerTime<0.6f?areaBannerTime/0.6f:1.f;
  for(auto* n:parts){UiOpacity(n,a);if(areaBannerTime<=0)UiVisible(n,false);}
}

void TopDownShooter::UpdatePrompt(float delta){
  // 상호작용 말풍선: 가까운 대상 머리 위에 [E] 하는 일 (말풍선 꼬리가 대상을 가리킴)
  static const char* parts[]={"PromptBack","PromptKey","PromptText","PromptTail"};
  const bool on=promptTarget&&!promptText.empty()&&!Paused&&dialogIndex>=dialog.size()&&!bagOpen&&!craftOpen&&settleTime<0&&!ending;  // 다른 창이 열리면 숨김 (말풍선 위젯이 따로라 HUD 창 위에 그려짐)
  for(auto* n:parts)UiVisible(n,on);
  if(!on)return;
  const bool key=promptText.rfind("E: ",0)==0;
  const std::string label=key?promptText.substr(3):promptText;
  size_t chars=0;for(unsigned char ch:label)chars+=(ch&0xC0)!=0x80;
  const float w=std::min(860.f,chars*19.f+(key?74.f:48.f)),h=40;  // 글자 양옆에 명패 테두리만큼 여백
  // 대상 그림의 위쪽 끝 (그림자 여백 0.25m 빼고) → 화면 좌표 (1m = 화면 높이 720 / (2 × 카메라 크기))
  static Interactable* sized=nullptr;static float top=1.0f;  // 그림 크기는 엔진에 묻는 값이라 대상이 바뀔 때만 읽음
  if(sized!=promptTarget){sized=promptTarget;top=std::max(1.0f,hb::Sprites::GetSize(promptTarget).y*0.5f-0.25f);}
  const auto at=hb::Scene::GetPosition(promptTarget);
  const float ppm=360.f/rules->CameraSize;
  float x=(at.x-cameraAt.x)*ppm,y=-(at.y+top+0.35f-cameraAt.y)*ppm-h/2;
  x=std::clamp(x,-640+w/2+8,640-w/2-8);y=std::clamp(y,-360+h/2+90,360-h/2-8);  // 화면 밖으로 나가지 않게 (위쪽은 HUD 아래까지)
  UiSize("PromptBack",hb::Vec2{w,h});UiPosition("PromptBack",hb::Vec2{x,y});
  UiVisible("PromptKey",key);UiPosition("PromptKey",hb::Vec2{x-w/2+30,y});
  UiText("PromptText",label);UiPosition("PromptText",hb::Vec2{x-w/2+(key?54.f:24.f)+300,y});  // 왼쪽 정렬 600px 상자의 왼쪽 끝을 맞춤
  UiPosition("PromptTail",hb::Vec2{x,y+h/2+5});
}

#include "TitleLayout.inl"
// 시작 연출 박자 (초, titleTime 기준): 바탕이 밝아짐 → 글자가 하나씩 → 땅 → 동전 튀어나옴 → 고리·별·Tap To Start
static const float kLetterStart=0.9f,kLetterGap=0.16f,kLetterPop=0.2f;
static float SlamTime(){return kLetterStart+kLetterGap*(kTitleLetters-1)+0.42f;}
static float TitleDone(){return SlamTime()+0.8f;}
static float EaseBack(float p){p=std::clamp(p,0.f,1.f);const float c=1.9f,q=p-1;return 1+(c+1)*q*q*q+c*q*q;}  // 살짝 넘쳤다 돌아옴

void TopDownShooter::TitleFx(float delta,bool visible){
  // 타이틀 (tools/gen_hud.py·make_title_fx.py). 엔진은 위젯 값 하나를 바꿀 때마다 위젯 전체를 복사해 넘기므로(수 ms)
  // 계속 움직이는 층(횃불·불티·금가루·별·안개·로고 금빛·Tap 금빛·동전 튀어나옴)은 스스로 움직이는 WebP이고,
  // C++는 정해진 순간에만 값을 바꿈: 처음 밝아짐(4번), 글자마다 3단계로 내려앉기, 땅(번쩍 3번 + 동전 그림 넣기), 끝(금빛 켜기)
  if(!visible){if(titleTime<0)return;titleTime=-1;
    static const int keyCounts[]={4,1,1,1,1,1,1,1};  // 조작 안내 (gen_hud.py KEYS)
    for(int g=0;g<8;++g){UiVisible("TitleKeyName"+std::to_string(g),false);for(int k=0;k<keyCounts[g];++k)UiVisible("TitleKey"+std::to_string(g)+"_"+std::to_string(k),false);}
    for(int k=0;k<kTitleLetters;++k)UiVisible("TitleLetter"+std::to_string(k),false);
    for(auto* n:{"TitleRays","TitleAmbient","TitleTapShade","TitleBurst","TitleShine","TitleFog","TitleFlash","TitleFade"})UiVisible(n,false);
    return;}
  if(titleTime<0){titleTime=0;titleBeat=0;  // 회사 로고 화면이 검게 끝난 순간이라 한꺼번에 켜도 보이지 않음
    for(int k=0;k<kTitleLetters;++k)UiVisible("TitleLetter"+std::to_string(k),true);
    for(auto* n:{"TitleRays","TitleAmbient","TitleFog","TitleFade"})UiVisible(n,true);}
  titleTime+=delta;const float t=titleTime,slam=SlamTime(),done=TitleDone();
  // 처음: 검은 화면이 4단계로 걷히고 빛줄기가 3단계로 밝아짐
  UiOpacity("TitleFade",t<0.2f?1.f:t<0.4f?0.7f:t<0.6f?0.4f:t<0.8f?0.15f:0.f);if(t>1.f)UiVisible("TitleFade",false);
  UiOpacity("TitleRays",t<0.5f?0.f:t<1.f?0.3f:t<1.5f?0.55f:0.7f);
  // 글자: 차례로 1.6배 → 1.25배 → 제자리로 쾅 (0.2초, 글자마다 값 4번)
  for(int k=0;k<kTitleLetters;++k){const float p=(t-kLetterStart-kLetterGap*k)/kLetterPop;const std::string n="TitleLetter"+std::to_string(k);
    UiOpacity(n,p<0?0.f:1.f);UiScale(n,p<0.33f?1.6f:p<0.66f?1.25f:1.f);
    if(p>=0&&titleBeat<=k){titleBeat=k+1;Sfx("Type",0.8f+0.05f*k);}}
  // 땅: 따뜻한 흰빛이 번쩍(3단계)하고 동전이 튀어나가는 그림을 그때 넣어 처음부터 재생
  if(t>=slam&&titleBeat<=kTitleLetters){titleBeat=kTitleLetters+1;Sfx("Boom");Sfx("Coin",1.1f);
    UiTexture("TitleBurst","Assets/UI/Kit/title_burst.webp");UiVisible("TitleBurst",true);}
  UiVisible("TitleFlash",t>=slam&&t<slam+0.3f);if(t>=slam&&t<slam+0.3f)UiOpacity("TitleFlash",t<slam+0.1f?0.75f:t<slam+0.2f?0.4f:0.15f);
  // 끝: 로고 금빛·Tap 금빛 켜기 (둘 다 스스로 반복)
  if(t>=done&&titleBeat<=kTitleLetters+1){titleBeat=kTitleLetters+2;UiVisible("TitleShine",true);UiVisible("TitleTapShade",true);
    static const int keyCounts[]={4,1,1,1,1,1,1,1};  // 조작 안내 (회사 로고 화면에서 숨긴 것을 연출이 끝나면 보임)
    for(int g=0;g<8;++g){UiVisible("TitleKeyName"+std::to_string(g),true);for(int k=0;k<keyCounts[g];++k)UiVisible("TitleKey"+std::to_string(g)+"_"+std::to_string(k),true);}}
}

void TopDownShooter::Splash(){
  // 회사 로고 (Phase 0, LoadingTime 동안): 검정 → 밝은 바탕에 로고가 살짝 커지며 떠오름 → 잠시 → 다시 검게
  const float t=phaseTime,end=rules->LoadingTime;
  UiOpacity("LoadingFade",t<0.4f?1-t/0.4f:t>end-0.5f?std::min(1.f,(t-(end-0.5f))/0.45f):0.f);
  UiOpacity("LoadingLogo",std::clamp((t-0.3f)/0.6f,0.f,1.f));UiScale("LoadingLogo",0.94f+0.06f*EaseBack((t-0.3f)/0.9f));
}

bool TopDownShooter::UpdateIntro(float delta,bool anyKey){
  // 회사 로고 → 타이틀(글자 연출, 아무 키) → 캐릭터 선택 → 오프닝 대화 (기획서 2장)
  if(Phase>=2)return false;
  phaseTime+=delta;hb::Physics::SetVelocity(player,hb::Vec3{0,0,0});
  if(Phase==0){if(anyKey&&phaseTime>0.2f)phaseTime=std::max(phaseTime,rules->LoadingTime-0.5f);Splash();}  // 키를 누르면 바로 검게 넘어감
  if(Phase==0&&phaseTime>=rules->LoadingTime){Phase=1;phaseTime=0;
    for(auto* n:{"LoadingBack","LoadingLogo","LoadingFade"})UiVisible(n,false);}
  TitleFx(delta,Phase==1&&!selecting);
  if(Phase==1&&!selecting&&anyKey&&titleTime<TitleDone())titleTime=TitleDone();  // 연출 중 키: 끝 화면으로 건너뜀 (게임 시작은 다음 키)
  else if(Phase==1&&!selecting&&anyKey&&phaseTime>0.3f){selecting=true;phaseTime=0;
    for(auto* n:{"TitleBack","TitleScreen"})UiVisible(n,false);TitleFx(0,false);introHidden=true;confirmHeld=true;ShowSelect(true);}
  else if(Phase==1&&selecting){
    // 1·2·3, A·D로 고르고 Enter·E·Space로 결정 (방향키는 쓰지 않음). 카드를 누르면 그 숫자 키가 눌리고, 고른 카드를 한 번 더 누르면 결정
    int key=0;for(int i=1;i<=3;++i)if(hb::Input::IsKeyDown(std::to_string(i)))key=i;
    const int side=hb::Input::IsKeyDown("d")?4:hb::Input::IsKeyDown("a")?5:0;
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
