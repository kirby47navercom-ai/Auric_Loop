#include "Common.h"
#include <algorithm>
#include <map>
#include <random>
#include <set>
#include <sstream>
#include <string>

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
