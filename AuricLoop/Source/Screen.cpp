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
    for(auto* n:{"LoadingBack","LoadingCoin","LoadingText","TitleBack","TitleScreen"})UiVisible(n,false);TitleFx(0,false);}
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
  UiText("Hint",hint);UiVisible("HintBack",!hint.empty());UiVisible("Minimap",inDungeon);  // 안내 받침은 문구 있을 때만, 미니맵은 던전에서만
  UiValue("Fatigue",FatigueMax>0?std::min(1.f,float(Fatigue)/FatigueMax):1.f);
  UiText("Title",Hp<=0?(Fatigue>=FatigueMax?"지쳐 쓰러졌다":"쓰러졌다")
    :ReturnSuccess?"귀환 성공 - 정산 "+std::to_string(LastRepaid)+" G 상환"
    :Returning?"귀환 - 문 "+std::to_string(DoorHits)+"/"+std::to_string(rules->DoorHitsToOpen)+"  섬광탄 "+(Flashbangs?std::to_string(Flashbangs):std::to_string(rules->FlashPrice)+"G")
    :HasReturnItem?"[귀환] 획득 - Tab으로 사용":boss?"해골 대장  "+std::to_string(int(std::ceil(BossHp)))+" HP":inHome?"원룸 Lv"+std::to_string(HomeLevel):area<0?"거점":"탐색");
}

static const char* kDirs8[]={"E","NE","N","NW","W","SW","S","SE"};
static int Sector(const hb::Vec3& v){return ((int)std::lround(Angle(v)/45)%8+8)%8;}

hb::Vec3 TopDownShooter::Muzzle(const hb::Vec3& from) const{
  // 새 시트는 방향마다 화살촉·카드 끝 픽셀을 기록해 둔다 (docs/캐릭터_시트_요청.md 9장). 192x96 그림, 원점은 발끝 0.95m 위
  static const char* names[]={"Valen","Sherry","Alea"};
  const std::string key=std::string(names[std::clamp(Character,0,2)])+"_"+kDirs8[Sector(facing)]+"=";
  for(const auto& m:rules->Muzzles)if(m.rfind(key,0)==0){const auto comma=m.find(',',key.size());if(comma==std::string::npos)break;
    const float px=std::stof(m.substr(key.size(),comma-key.size())),py=std::stof(m.substr(comma+1));
    return from+hb::Vec3{(px-96)/32,(96-py-38.4f)/32,0.25f};}
  return from+facing*1.0f+hb::Vec3{0,0.3f,0.25f};
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

void TopDownShooter::Animate(float delta,bool moving){
  // 8방향: 그림은 남·남동·동·북동·북 5방향이고 서쪽 셋은 동쪽 그림을 뒤집는다
  // 프레임: 공격 3장(0.1초씩) > 걷기 4장(초당 8장) > 서 있기
  static const char* dirs[]={"E","NE","N","NE","E","SE","S","SE"};
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
  for(auto* n:{"SelectBack","SelectTitle","SelectHint","SelectConfirm"})UiVisible(n,visible);
  for(int i=0;i<3;++i){const std::string k=std::to_string(i);
    for(auto* n:{"SelectCard","SelectArt","SelectName","SelectWeapon","SelectDebt","SelectTouch"})UiVisible(n+k,visible);
    UiVisible("SelectPick"+k,visible&&i==pick);}
}

void TopDownShooter::TitleFx(float delta,bool visible){
  // 타이틀 그림 위 층 (tools/gen_hud.py TITLE_FX·KEYS): 보일 때만 움직이고, 넘어가면 모두 숨김
  static const int keyCounts[]={4,1,1,1,1,1,1};
  if(!visible){if(titleTime<0)return;titleTime=-1;
    for(int g=0;g<7;++g){UiVisible("TitleKeyName"+std::to_string(g),false);
      for(int k=0;k<keyCounts[g];++k)UiVisible("TitleKey"+std::to_string(g)+"_"+std::to_string(k),false);}
    for(auto* n:{"TitleTorchL","TitleTorchR"})UiVisible(n,false);
    for(int i=0;i<8;++i){if(i<7)UiVisible("TitleStar"+std::to_string(i),false);UiVisible("TitleDust"+std::to_string(i),false);}
    return;}
  if(titleTime<0){titleTime=0;  // 로딩 동안 숨겼던 것을 다시 보임
    for(int g=0;g<7;++g){UiVisible("TitleKeyName"+std::to_string(g),true);for(int k=0;k<keyCounts[g];++k)UiVisible("TitleKey"+std::to_string(g)+"_"+std::to_string(k),true);}
    for(auto* n:{"TitleTorchL","TitleTorchR"})UiVisible(n,true);
    for(int i=0;i<8;++i){if(i<7)UiVisible("TitleStar"+std::to_string(i),true);UiVisible("TitleDust"+std::to_string(i),true);}}
  titleTime+=delta;const float t=titleTime;
  // 횃불: 두 겹 사인 + 작은 흔들림으로 불규칙하게 밝기·크기
  for(int i=0;i<2;++i){const float f=0.5f+0.25f*std::sin(t*9.1f+i*2)+0.15f*std::sin(t*23.7f+i*5)+0.1f*std::sin(t*3.3f+i);
    const std::string n=i?"TitleTorchR":"TitleTorchL";UiOpacity(n,0.55f+0.4f*f);UiScale(n,0.92f+0.12f*f);}
  // 별: 서로 다른 박자로 커졌다 사라짐
  for(int i=0;i<7;++i){const float p=std::fmod(t*0.55f+i*0.37f,1.f),s=p<0.35f?std::sin(p/0.35f*3.14159f):0.f;
    const std::string n="TitleStar"+std::to_string(i);UiScale(n,0.2f+0.9f*s);UiOpacity(n,s);}
  // 금가루: 바닥 쪽에서 천천히 떠올라 흐려짐 (화면 아래 1/3에서 시작, 좌우로 살랑)
  for(int i=0;i<8;++i){const float life=5.f+i%3,p=std::fmod(t+i*1.37f,life)/life;
    const float x=120+std::fmod(i*331.f,1040.f)+std::sin(t*1.3f+i)*14,y=690-p*420;
    const std::string n="TitleDust"+std::to_string(i);UiPosition(n,hb::Vec2{x,y});UiOpacity(n,std::sin(p*3.14159f)*0.9f);}
}

bool TopDownShooter::UpdateIntro(float delta,bool anyKey){
  // 로딩(금화 GIF) → 타이틀(아무 키) → 캐릭터 선택 → 오프닝 대화 (기획서 2장)
  if(Phase>=2)return false;
  phaseTime+=delta;hb::Physics::SetVelocity(player,hb::Vec3{0,0,0});
  if(Phase==0&&phaseTime>=rules->LoadingTime){Phase=1;phaseTime=0;
    for(auto* n:{"LoadingBack","LoadingCoin","LoadingText"})UiVisible(n,false);}
  TitleFx(delta,Phase==1&&!selecting);
  if(Phase==1&&!selecting&&anyKey&&phaseTime>0.3f){selecting=true;phaseTime=0;
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
