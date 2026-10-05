#include "TopDownShooter.h"
#include <cmath>
#include <string>
#include <algorithm>

// 수치는 docs/데모_기획서.md 4-1, 4-2, 5장 기준.
// ponytail: 상수로 둠. 편집기에서 바꿔야 하면 HB_PROPERTY로 옮김.
namespace balance {
constexpr int playerHp=3;              // 기획: 체력 3 (실제 최대치는 MaxHp)
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
constexpr float enterDepth=2.0f;
constexpr int potionPrice=15;          // [제안] 체력 회복 물약
constexpr int upgradePrice=20;         // 기획서 6-2 [제안: 가격], 층마다 1회
constexpr float upgradeBonus=0.15f;    // 강화 +1마다 무기공격력 15%
constexpr float interactRange=2.2f;
constexpr float coinMagnet=3.0f,coinPickup=0.7f;
constexpr float repayRate=0.5f;        // 기획서 6-4 정산 상환 비율
constexpr float enchantPower=0.3f;     // 기획서 6-2-1 단순 증폭 +30% [제안]
constexpr float burnTime=3.0f,burnRate=0.1f;  // 기획: 3초 동안 1초마다 무기공격력 10%
constexpr float slashExtend=1.5f;      // 검기: 사거리 +1.5m. ponytail: 날아가는 검기 투사체는 아군 탄이 생기면 교체
constexpr int sofaPrice=50,sofaMax=3;  // 기획서 3-1 원룸 [제안: 가격]
constexpr int homePrice=150;           // 인테리어 공사 Lv2 [제안: 가격]
constexpr int homeFatigueBonus=5;      // 기획: 공사마다 피로도 한계 상승 (데모 한계 20 기준 +5)
constexpr int doorHitsToOpen=10;       // 기획: 귀환 중 잠긴 문은 10번 때리면 열림
constexpr float doorStun=1.0f;         // 기획: 문이 열리면 1초 전체 스턴
constexpr float flashStun=1.0f;        // 기획: 섬광탄 1초 전체 스턴 + 탄막 제거
constexpr float doorReach=2.5f;        // 문까지 이 거리 안에서 베면 문을 때린 것       // 문을 지나 이만큼 들어오면 방에 들어온 것으로 봄 (m)
}

// <rooms> tools/gen_scene.py가 만든 표. 손으로 고치지 말고 생성기를 고친다.
struct Spawn{float x,y;int ranged;};
struct Room{float cy,half;int kind,first,count;};  // kind: 0 전투, 1 채집, 2 상점, 3 보스
constexpr Spawn spawns[]={{-6.0f,4.0f,0},{0.0f,6.0f,0},{6.0f,4.0f,0},{-7.0f,3.0f,0},{7.0f,3.0f,0},{-5.0f,8.0f,1},{5.0f,8.0f,1}};
constexpr Room rooms[]={{0.0f,12.0f,0,0,3},{25.0f,12.0f,0,3,4},{46.0f,8.0f,1,7,0},{67.0f,12.0f,2,7,0},{96.0f,16.0f,3,7,0}};
constexpr int roomCount=5;
// </rooms>

// <hub> tools/gen_scene.py가 만든 거점 상호작용 자리
struct Spot{const char* id;float x,y;};
constexpr Spot hubSpots[]={{"DebtBoard",0.0f,-29.0f},{"Entrance",0.0f,-15.5f},{"Collector",16.0f,-29.0f},{"Interior",21.0f,-29.0f},{"ClosedRental",26.5f,-29.0f},{"ClosedCharm",15.5f,-39.5f},{"ClosedRecipe",21.0f,-39.5f},{"ClosedRelic",26.5f,-39.5f},{"Sofa",-19.0f,-30.0f},{"Bed",-23.0f,-37.0f},{"Fridge",-15.0f,-37.0f},{"TV",-19.0f,-37.5f}};
constexpr float dungeonBottom=-13.0f;  // 이보다 아래는 거점
// </hub>

static int RoomAt(float y){if(y<rooms[0].cy-rooms[0].half-1)return -1;  // 거점
  for(int i=0;i<roomCount;++i)if(y<=rooms[i].cy+rooms[i].half+0.5f)return i;return roomCount-1;}

static float Length(const hb::Vec3& v){return std::sqrt(hb::VectorMath::VectorLengthSquared(v));}
static hb::Vec3 Rotate(const hb::Vec3& v,float degrees){const float r=degrees*3.14159265f/180,c=std::cos(r),s=std::sin(r);return {v.x*c-v.y*s,v.x*s+v.y*c,0};}

void TopDownShooter::Hud(hb::Actor* player){
  // UIWidget 인스턴스는 첫 프레임 뒤에 생기므로 그 전에는 표시만 미룬다
  if(frame<2){hudDirty=true;return;}
  hudDirty=false;
  // 요소 이름은 tools/gen_hud.py가 만든 W_TopDown과 같다
  const int hp=Hp<0?0:Hp;
  for(int i=1;i<=MaxHp;++i)hb::UI::SetVisible(player,"HUD","HpFill"+std::to_string(i),hp==i);
  hb::UI::SetText(player,"HUD","HpText",std::to_string(hp)+" / "+std::to_string(MaxHp));
  hb::UI::SetText(player,"HUD","WeightText",std::to_string(Weight())+" / 100");
  hb::UI::SetText(player,"HUD","GoldText",std::to_string(Gold)+" G   빚 "+std::to_string(Debt));
  hb::UI::SetText(player,"HUD","Hint",hint);
  int level=FatigueMax>0?Fatigue*10/FatigueMax:10;if(level>10)level=10;  // 10% 단위 그림
  if(level!=fatigueLevel){
    auto name=[](int lv){std::string n=std::to_string(lv*10);return "Fatigue"+std::string(3-n.size(),'0')+n;};
    if(fatigueLevel>=0)hb::UI::SetVisible(player,"HUD",name(fatigueLevel),false);
    hb::UI::SetVisible(player,"HUD",name(level),true);fatigueLevel=level;
  }
  hb::UI::SetText(player,"HUD","Title",Hp<=0?(Fatigue>=FatigueMax?"지쳐 쓰러졌다":"쓰러졌다")
    :ReturnSuccess?"귀환 성공 - 정산 "+std::to_string(LastRepaid)+" G 상환":Returning?"귀환 - 문 "+std::to_string(DoorHits)+"/"+std::to_string(balance::doorHitsToOpen)+"  섬광탄 "+std::to_string(Flashbangs)
    :HasReturnItem?"[귀환] 획득 - Tab으로 사용":bossActor&&hb::ActorPool::IsActive(bossActor)?"해골 대장":RoomIndex<0?"거점":"탐색");
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

void TopDownShooter::DropCoin(const std::vector<hb::Actor*>& items,const hb::Vec3& at,int value){
  if(items.size()<3){Gold+=value;return;}
  const std::vector<hb::Actor*> coins(items.begin()+2,items.end());
  hb::Transform t;t.position=hb::Vec3{at.x,at.y,0.05f};
  if(auto* c=hb::ActorPool::Acquire(coins,t))coinValue[c]=value;else Gold+=value;  // 풀이 모자라면 바로 지급
}

void TopDownShooter::Interact(hb::Actor* player,const hb::Vec3& position,const std::vector<hb::Actor*>& items,bool pressed){
  // E 하나로 채집·구매·강화 (기획: [2] 상호작용·채집). 가까운 대상의 안내 문구를 위에 띄운다.
  std::string next;
  auto near=[&](const hb::Vec3& at){return Length(at-position)<balance::interactRange;};
  const Room& shop=rooms[3];
  const hb::Vec3 smithAt{-6,shop.cy+5,0},stallAt{6,shop.cy+5,0};  // tools/gen_scene.py props와 같은 자리
  if(items.size()>=2&&hb::ActorPool::IsActive(items[0])&&near(hb::Scene::GetPosition(items[0]))){
    next="E: 광물 채집 (30kg)";if(pressed){Ore++;Fatigue++;hb::ActorPool::Release(items[0]);next="";}
  }else if(items.size()>=2&&hb::ActorPool::IsActive(items[1])&&near(hb::Scene::GetPosition(items[1]))){
    next="E: 약초 채집 (3개)";if(pressed){Herb+=3;Fatigue++;hb::ActorPool::Release(items[1]);next="";}
  }else if(near(smithAt+hb::Vec3{0,-1.5f,0})){
    next=WeaponLevel?"대장장이: 이번 층 강화는 끝났어":"E: 검 강화 +1 ("+std::to_string(balance::upgradePrice)+" G)";
    if(pressed&&!WeaponLevel&&Gold>=balance::upgradePrice){Gold-=balance::upgradePrice;WeaponLevel=1;next="발렌의 검 +1";}
  }else if(near(stallAt+hb::Vec3{0,-1.5f,0})){
    next="E: 회복 물약 ("+std::to_string(balance::potionPrice)+" G, 체력 +1)";
    if(pressed&&Gold>=balance::potionPrice&&Hp<MaxHp){Gold-=balance::potionPrice;Hp++;}
  }
  if(next!=hint||pressed){hint=next;Hud(player);}
}

float TopDownShooter::WeaponDamage() const{
  return balance::swordDamage*(1+balance::upgradeBonus*WeaponLevel)*(Enchant==1?1+balance::enchantPower:1);
}

void TopDownShooter::CraftDetail(hb::Actor* player){
  // 오른쪽 설명: 키트 제작 창 시안의 이름 / 효과 / 종류 / 필요 소재
  static const char* names[]={"","회복 물약","섬광탄","각인 결정: 증폭","각인 결정: 화상","각인 결정: 검기"};
  static const char* effects[]={"","체력 1 회복","1초 전체 스턴, 탄막 제거","무기공격력 +30%","맞은 적이 3초 동안 불탐","베기 사거리 +1.5m"};
  std::string cost;
  if(craftPick==1)cost="약초 "+std::to_string(Herb)+" / 3    빈 병 "+std::to_string(Bottle)+" / 1";
  else if(craftPick==2)cost="광물 "+std::to_string(Ore)+" / 1";
  else cost="마물 소재 "+std::to_string(Monster)+" / 1   (각인은 하나만, 새로 하면 덮어씀)";
  hb::UI::SetText(player,"HUD","CraftName",names[craftPick]);
  hb::UI::SetText(player,"HUD","CraftEffect",effects[craftPick]);
  hb::UI::SetText(player,"HUD","CraftType",craftPick<=2?"소모 아이템":"무기 각인 (귀환하면 사라짐)");
  hb::UI::SetText(player,"HUD","CraftCost",cost);
}

void TopDownShooter::Craft(hb::Actor* player,bool toggle,int pick,bool confirm){
  // 제작 창 (기획서 6-2-2): Q로 열고 닫음, 1~5 선택, Enter·제작하기로 제작. 열려 있어도 게임은 계속된다.
  static const char* parts[]={"CraftPanel","CraftTitle","CraftSub","CraftIcon1","CraftIcon2","CraftIcon3","CraftIcon4","CraftIcon5",
    "CraftKey1","CraftKey2","CraftKey3","CraftKey4","CraftKey5","CraftSlot1","CraftSlot2","CraftSlot3","CraftSlot4","CraftSlot5",
    "CraftSelect","CraftName","CraftEffect","CraftType","CraftNeed","CraftCost","CraftConfirm","CraftConfirmButton","CraftClose","CraftFooter"};
  if(toggle){craftOpen=!craftOpen;for(auto* n:parts)hb::UI::SetVisible(player,"HUD",n,craftOpen);if(craftOpen)CraftDetail(player);}
  if(!craftOpen)return;
  if(pick>0){craftPick=pick;CraftDetail(player);}  // ponytail: 선택 테두리 위치 이동은 위젯 위치 API가 생기면
  if(!confirm)return;
  bool done=false;
  if(craftPick==1&&Herb>=3&&Bottle>=1&&Hp<MaxHp){Herb-=3;Bottle--;Hp++;done=true;}
  else if(craftPick==2&&Ore>=1){Ore--;Flashbangs++;done=true;}
  else if(craftPick>=3&&Monster>=1){Monster--;Enchant=craftPick-2;done=true;}
  if(done){Crafted++;hint=std::string("제작 완료: ")+(craftPick==1?"회복 물약":craftPick==2?"섬광탄":"각인 결정");}
  else hint="소재가 모자라요";
  CraftDetail(player);Hud(player);
}

void TopDownShooter::HubInteract(hb::Actor* player,const hb::Vec3& position,bool pressed){
  // 거점 (기획서 3-1, 기획팀 10/05): 수금원·인테리어 상인·원룸 소파만 동작, 나머지는 안내 문구
  const Spot* best=nullptr;float bestLen=balance::interactRange+0.8f;
  for(const auto& s:hubSpots){const float len=Length(hb::Vec3{s.x,s.y-1.2f,0}-position);if(len<bestLen){bestLen=len;best=&s;}}
  std::string next,id=best?best->id:"";
  if(id=="DebtBoard")next="부채 전광판 - 발렌 남은 빚 "+std::to_string(Debt)+" G"+(LastRepaid?"  (지난 정산 "+std::to_string(LastRepaid)+" G 상환)":"");
  else if(id=="Entrance")next="마몬의 입 - 황금 던전 입구";
  else if(id=="Collector"){next=Gold>0?"E: 수금원에게 "+std::to_string(Gold)+" G 모두 갚기":"수금원: 이번 주 이자는 아직이던데?";
    if(pressed&&Gold>0){Debt-=Gold;if(Debt<0)Debt=0;LastRepaid+=Gold;Gold=0;next="수금원: 거래 감사합니다, 고객님";}}
  else if(id=="Interior"){next=HomeLevel>=2?"세공사: 다음 공사는 다음 시즌에!":"E: 원룸 공사 Lv2 ("+std::to_string(balance::homePrice)+" G, 피로도 한계 +"+std::to_string(balance::homeFatigueBonus)+")";
    if(pressed&&HomeLevel<2&&Gold>=balance::homePrice){Gold-=balance::homePrice;HomeLevel=2;FatigueMax+=balance::homeFatigueBonus;next="원룸이 넓어졌다!";}}
  else if(id=="Sofa"){next=SofaLevel>=balance::sofaMax?"푹신한 소파. 더는 바꿀 수 없다":"E: 소파 바꾸기 ("+std::to_string(balance::sofaPrice)+" G, 최대 체력 +1)";
    if(pressed&&SofaLevel<balance::sofaMax&&Gold>=balance::sofaPrice){Gold-=balance::sofaPrice;SofaLevel++;MaxHp++;Hp=MaxHp;}}
  else if(id=="Bed")next="삐걱거리는 침대. 오늘 밤도 빚 꿈을 꾸겠지";
  else if(id=="Fridge")next="텅 빈 냉장고. 물 한 병뿐이다";
  else if(id=="TV")next="꺼진 TV. 화면에 비친 내 얼굴이 피곤해 보인다";
  else if(id=="ClosedRental"||id=="ClosedRelic")next="휴가 중입니다. 빚쟁이 여러분 다음에 또 오세요";
  else if(id=="ClosedCharm"||id=="ClosedRecipe")next="가게 개장 준비 중";
  if(next!=hint||pressed){hint=next;Hud(player);}
}

void TopDownShooter::Settle(hb::Actor* player){
  // 정산 (기획서 6-4): 소재를 골드로 바꾸고 절반을 빚에서 자동 상환, 강화는 초기화
  const int total=Gold+Ore*40+Herb*5+Monster*30;
  LastRepaid=int(total*balance::repayRate);
  Debt-=LastRepaid;if(Debt<0)Debt=0;
  Gold=total-LastRepaid;Ore=Herb=Monster=0;WeaponLevel=0;Enchant=0;
  Hud(player);
}

void TopDownShooter::StunAll(const std::vector<hb::Actor*>& enemies,float seconds){
  for(auto* e:enemies)if(hb::ActorPool::IsActive(e)){stun[e]=seconds;hb::Physics::SetVelocity(e,hb::Vec3{0,0,0});}
}

void TopDownShooter::UpdateReturn(hb::Actor* player,const hb::Vec3& position,const std::vector<hb::Actor*>& enemies,const std::vector<hb::Actor*>& doors){
  // 귀환 페이즈 (기획서 6-3): 지나온 방을 거꾸로 걸어 나간다. 방마다 무적 해골이 한꺼번에 나오고,
  // 아래쪽 문은 잠겨서 10번 때려야 열린다. 입구 근처에 닿으면 귀환 성공.
  const int at=RoomAt(position.y);
  if(at<0){  // 거점 계단에 닿으면 귀환 성공
    Returning=false;ReturnSuccess=true;for(auto* e:enemies)if(hb::ActorPool::IsActive(e))hb::ActorPool::Release(e);Settle(player);return;
  }
  if(at==returnRoom)return;
  for(auto* e:enemies)if(hb::ActorPool::IsActive(e))hb::ActorPool::Release(e);  // 지나온 방의 해골은 정리
  returnRoom=at;DoorHits=0;Fatigue++;  // 기획: 귀환 중에도 방을 지날 때 피로도 +1
  if(Fatigue>=FatigueMax){Hp=0;gameOver=balance::respawnDelay;}
  if(at>0&&at-1<(int)doors.size()&&!hb::ActorPool::IsActive(doors[at-1])){hb::Transform t;t.position=hb::Scene::GetPosition(doors[at-1]);hb::ActorPool::Acquire(std::vector<hb::Actor*>{doors[at-1]},t);}
  const Room& r=rooms[at];
  const std::vector<hb::Actor*> melee(enemies.begin(),enemies.begin()+balance::rangedFrom),ranged(enemies.begin()+balance::rangedFrom,enemies.end());
  const float spots[][3]={{-0.5f,0.3f,0},{0.5f,0.3f,0},{-0.6f,-0.2f,1},{0.6f,-0.2f,1},{0.f,0.5f,1}};  // 방 크기 비율 위치
  for(auto& s:spots){hb::Transform t;t.position=hb::Vec3{s[0]*r.half,r.cy+s[1]*r.half,0.1f};
    if(auto* e=hb::ActorPool::Acquire(s[2]?ranged:melee,t)){enemyHp[e]=balance::enemyHp;stun[e]=0.8f;}}
  Hud(player);
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

void TopDownShooter::Update(float delta,const std::vector<hb::Actor*>& bullets,const std::vector<hb::Actor*>& enemies,const std::vector<hb::Actor*>& effects,const std::vector<hb::Actor*>& doors,const std::vector<hb::Actor*>& boss,const std::vector<hb::Actor*>& items){
  auto* player=hb::Gameplay::GetPlayerPawn();if(!player)return;
  frame++;if(hudDirty)Hud(player);
  if(!started){started=true;Hp=MaxHp;
    for(size_t i=0;i<enemies.size();++i){enemyHp[enemies[i]]=balance::enemyHp;shotTimer[enemies[i]]=1+0.3f*i;}
    Hud(player);}
  const auto position=hb::Scene::GetPosition(player);
  if(RoomAt(position.y)!=RoomIndex&&!Returning){RoomIndex=RoomAt(position.y);if(RoomIndex<0)Hud(player);}  // 거점이면 -1
  const Room& room=rooms[RoomIndex<0?0:RoomIndex];

  // 방 입장: 문을 지나 조금 들어오면 그 방의 적이 나오고 문이 잠긴다
  if(RoomAt(position.y)>=0){const int at=RoomAt(position.y);const Room& r=rooms[at];
   if(!Returning&&!ReturnSuccess&&(position.y>r.cy-r.half+balance::enterDepth||at==0))EnterRoom(at,enemies,doors,boss);}

  // 탄환 수명과 방 밖으로 나간 탄환 정리
  for(auto it=lifetime.begin();it!=lifetime.end();){
    const auto p=hb::Scene::GetPosition(it->first);it->second-=delta;
    if(it->second<=0||std::fabs(p.x)>room.half||std::fabs(p.y-room.cy)>room.half){hb::ActorPool::Release(it->first);it=lifetime.erase(it);}else ++it;
  }

  if(Hp<=0){ // ponytail: 정산 화면이 생기면 거기로 보냄. 지금은 3초 뒤 회복
    hb::Physics::SetVelocity(player,hb::Vec3{0,0,0});gameOver-=delta;
    for(auto* e:enemies)if(hb::ActorPool::IsActive(e))hb::Physics::SetVelocity(e,hb::Vec3{0,0,0});
    for(auto& [b,life]:lifetime)hb::Physics::SetVelocity(b,hb::Vec3{0,0,0});
    if(gameOver<=0){Hp=MaxHp;Fatigue=0;invulnerable=balance::invulnerableTime*2;Hud(player);}
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

  // [귀환] 사용 (가방 Tab), 귀환 중 섬광탄 (E)
  const bool tab=hb::Input::IsKeyDown("tab");
  if(tab&&!returnHeld&&HasReturnItem&&!Returning&&!ReturnSuccess){HasReturnItem=false;Returning=true;returnRoom=-1;}
  returnHeld=tab;
  const bool flash=hb::Input::IsKeyDown("e");
  if(RoomAt(position.y)<0)HubInteract(player,position,flash&&!flashHeld);
  else if(!Returning)Interact(player,position,items,flash&&!flashHeld);
  if(flash&&!flashHeld&&Returning&&Flashbangs>0){Flashbangs--;StunAll(enemies,balance::flashStun);
    for(auto& [b,life]:lifetime)life=0;Hud(player);}
  flashHeld=flash;
  if(Returning)UpdateReturn(player,position,enemies,doors);
  {const bool q=hb::Input::IsKeyDown("q"),enter=hb::Input::IsKeyDown("enter");int pick=0;
   for(int i=1;i<=5;++i)if(hb::Input::IsKeyDown(std::to_string(i)))pick=i;
   Craft(player,q&&!craftKeyHeld,pick,enter&&!confirmHeld);craftKeyHeld=q;confirmHeld=enter;}

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
      return len<=balance::swordRange+(Enchant==3?balance::slashExtend:0)&&(len<=balance::contactRange||hb::VectorMath::DotProduct(d*(1/len),facing)>=minDot);};  // 바로 붙은 적은 방향과 관계없이 맞음
    for(auto* e:enemies){if(!hb::ActorPool::IsActive(e))continue;
      const auto at=hb::Scene::GetPosition(e);if(!inFan(at))continue;
      const auto d=at-position;const float len=Length(d);
      if(!Returning){enemyHp[e]-=WeaponDamage();if(Enchant==2)burn[e]=balance::burnTime;}Hits++;stun[e]=balance::swordStun;  // 귀환 중 해골은 무적
      hb::Physics::SetVelocity(e,(len>.01f?d*(1/len):facing)*6);
      if(enemyHp[e]<=0){hb::ActorPool::Release(e);Kills++;DropCoin(items,at,1+Kills%3);  // 해골 1~3 G
        if(fightingRoom==1){int left=0;for(auto* o:enemies)left+=hb::ActorPool::IsActive(o);if(!left)Monster++;}}  // 전투방2 마지막 해골은 마물 소재 확정
    }
    if(Returning&&returnRoom>0&&hb::ActorPool::IsActive(doors[returnRoom-1])&&Length(hb::Scene::GetPosition(doors[returnRoom-1])-position)<balance::doorReach){
      if(++DoorHits>=balance::doorHitsToOpen){hb::ActorPool::Release(doors[returnRoom-1]);StunAll(enemies,balance::doorStun);}
      Hud(player);
    }
    if(bossActor&&hb::ActorPool::IsActive(bossActor)){
      const auto d=hb::Scene::GetPosition(bossActor)-position;const float len=Length(d);
      if(len<=balance::swordRange+balance::bossRadius&&(len<=balance::bossRadius+balance::contactRange||hb::VectorMath::DotProduct(d*(1/len),facing)>=minDot)){
        BossHp-=WeaponDamage();Hits++;
        if(BossHp<=0){const auto at=hb::Scene::GetPosition(bossActor);hb::ActorPool::Release(bossActor);Kills++;HasReturnItem=true;Monster++;DropCoin(items,at,30);Hud(player);}
      }
    }
    for(auto it=lifetime.begin();it!=lifetime.end();)
      if(inFan(hb::Scene::GetPosition(it->first))){hb::ActorPool::Release(it->first);it=lifetime.erase(it);}else ++it;
  }

  // 해골: 근거리는 추격, 원거리는 거리를 두고 3갈래 탄 발사
  int alive=0;
  for(size_t i=0;i<enemies.size();++i){auto* e=enemies[i];if(!hb::ActorPool::IsActive(e))continue;alive++;
    if(burn[e]>0){burn[e]-=delta;enemyHp[e]-=WeaponDamage()*balance::burnRate*delta;  // 화상
      if(enemyHp[e]<=0){hb::ActorPool::Release(e);Kills++;burn[e]=0;continue;}}
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
  for(size_t i=2;i<items.size();++i){auto* c=items[i];if(!hb::ActorPool::IsActive(c))continue;  // 골드: 가까이 가면 끌려와서 주워짐
    const auto d=position-hb::Scene::GetPosition(c);const float len=Length(d);
    if(len<balance::coinPickup){Gold+=coinValue[c];hb::ActorPool::Release(c);Hud(player);}
    else if(len<balance::coinMagnet)hb::Scene::SetPosition(c,hb::Scene::GetPosition(c)+d*(std::min(1.f,delta*8)));}
  // 방 클리어: 문이 열리고 피로도 +1 (기획), 피로도가 가득 차면 쓰러짐
  if(alive==0&&fightingRoom>=0){
    roomState[fightingRoom]=2;SetDoors(doors,fightingRoom,false);fightingRoom=-1;
    RoomClears++;Fatigue++;if(Fatigue>=FatigueMax){Hp=0;gameOver=balance::respawnDelay;}Hud(player);
  }
}
