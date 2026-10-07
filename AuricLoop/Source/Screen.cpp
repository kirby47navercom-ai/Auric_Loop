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
  UiText("Hint",hint);UiVisible("HintBack",!hint.empty());UiVisible("Minimap",inDungeon);  // 안내 받침은 문구 있을 때만, 미니맵은 던전에서만
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
