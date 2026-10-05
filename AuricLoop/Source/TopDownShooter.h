#pragma once
#include <HBEngine/Game.hpp>
#include <map>
#include <string>
#include <vector>
#include <cstdlib>
HB_CLASS(Blueprintable)
class TopDownShooter : public hb::Actor {
public:
  HB_FUNCTION(BlueprintCallable, KoreanName="조준·발사·탄환 재사용", Category="탑다운 슈터")
  void Update(float delta,const std::vector<hb::Actor*>& bullets,const std::vector<hb::Actor*>& enemies,const std::vector<hb::Actor*>& effects,const std::vector<hb::Actor*>& doors,const std::vector<hb::Actor*>& boss,const std::vector<hb::Actor*>& items,const std::vector<hb::Actor*>& shots);
  // 피로도 한계. 기획 100, 데모 기본 20 (docs/데모_기획서.md 4-1). 편집기 BP 기본값에서 바꿀 수 있음.
  HB_PROPERTY(BlueprintReadWrite)
  int FatigueMax = 20;
  HB_PROPERTY(BlueprintReadWrite)
  int Fatigue = 0;
  HB_PROPERTY(BlueprintReadWrite)
  int Hp = 0;
  HB_PROPERTY(BlueprintReadWrite)
  int Kills = 0;
  HB_PROPERTY(BlueprintReadWrite)
  int RoomClears = 0;
  HB_PROPERTY(BlueprintReadWrite)
  int Swings = 0;
  HB_PROPERTY(BlueprintReadWrite)
  int Hits = 0;
  HB_PROPERTY(BlueprintReadWrite)
  int Shots = 0;
  HB_PROPERTY(BlueprintReadWrite)
  int RoomIndex = 0;
  HB_PROPERTY(BlueprintReadWrite)
  float BossHp = 0;
  HB_PROPERTY(BlueprintReadWrite)
  bool HasReturnItem = false;  // 기획: 보스를 잡으면 [귀환] 아이템
  HB_PROPERTY(BlueprintReadWrite)
  bool Returning = false;      // 귀환 페이즈
  HB_PROPERTY(BlueprintReadWrite)
  bool ReturnSuccess = false;
  HB_PROPERTY(BlueprintReadWrite)
  int DoorHits = 0;
  HB_PROPERTY(BlueprintReadWrite)
  int Flashbangs = 0;          // 제작한 섬광탄. 없으면 한 번에 골드 10 (기획서 6-3)
  // 재화·소재 (기획서 6-1). 광물 30kg/40G, 약초 5kg/5G, 마물형 15kg/30G
  HB_PROPERTY(BlueprintReadWrite)
  int Gold = 0;
  HB_PROPERTY(BlueprintReadWrite)
  int Ore = 0;
  HB_PROPERTY(BlueprintReadWrite)
  int Herb = 0;
  HB_PROPERTY(BlueprintReadWrite)
  int Monster = 0;
  HB_PROPERTY(BlueprintReadWrite)
  int Bottle = 1;              // 빈 병: 오프닝에서 1개 (기획서 6-2-2)
  HB_PROPERTY(BlueprintReadWrite)
  int WeaponLevel = 0;         // 대장간 강화 +N
  HB_PROPERTY(BlueprintReadWrite)
  int Debt = 9800;             // 발렌 빚 (기획서 6-4)
  HB_PROPERTY(BlueprintReadWrite)
  int LastRepaid = 0;
  HB_PROPERTY(BlueprintReadWrite)
  int Enchant = 0;             // 각인: 0 없음, 1 증폭(+30%), 2 화상, 3 검기(사거리) — 하나만, 새로 하면 덮어씀
  HB_PROPERTY(BlueprintReadWrite)
  int Crafted = 0;
  HB_PROPERTY(BlueprintReadWrite)
  int MaxHp = 3;               // 원룸 소파 업그레이드로 +1 (최대 3회)
  HB_PROPERTY(BlueprintReadWrite)
  int SofaLevel = 0;
  HB_PROPERTY(BlueprintReadWrite)
  int HomeLevel = 1;           // 인테리어 공사 Lv1→2 (피로도 한계 +5)
  HB_PROPERTY(BlueprintReadWrite)
  int Phase = 0;               // 0 로딩, 1 타이틀·캐릭터 선택, 2 게임
  HB_PROPERTY(BlueprintReadWrite)
  int Character = 0;           // 0 발렌(검), 1 셰리(활), 2 알레아(마탄)
  // ---- 에셋 경로: 언리얼 UPROPERTY처럼 BP 기본값(편집기 속성)에서 바꾼다. C++ 안에는 경로를 박지 않는다 ----
  HB_PROPERTY(BlueprintReadWrite)
  std::string ValenSprites = "Assets/Sprites/Valen/S_Valen_";     // + Idle_0 / Walk_0~3 / Attack_0~2 + .hbsprite.json
  HB_PROPERTY(BlueprintReadWrite)
  std::string SherrySprites = "Assets/Sprites/Sherry/S_Sherry_";
  HB_PROPERTY(BlueprintReadWrite)
  std::string AleaSprites = "Assets/Sprites/Alea/S_Alea_";
  HB_PROPERTY(BlueprintReadWrite)
  std::string ArrowSprite = "Assets/Sprites/FX/S_Arrow.hbsprite.json";
  HB_PROPERTY(BlueprintReadWrite)
  std::string BoltSprite = "Assets/Sprites/FX/S_Bolt.hbsprite.json";
  HB_PROPERTY(BlueprintReadWrite)
  std::string BoomSprite = "Assets/Sprites/FX/S_Boom.hbsprite.json";
  HB_PROPERTY(BlueprintReadWrite)
  std::string HubScene = "Assets/Scenes/Hub.hbscene.json";
  HB_PROPERTY(BlueprintReadWrite)
  std::string DungeonScene = "Assets/Scenes/Dungeon_#.hbscene.json";  // # 자리에 방 번호
  HB_PROPERTY(BlueprintReadWrite)
  std::string SfxSlash = "Assets/Audio/S_Slash.hbaudioasset.json";  // 검 베기
  HB_PROPERTY(BlueprintReadWrite)
  std::string SfxArrow = "Assets/Audio/S_Arrow.hbaudioasset.json";  // 화살
  HB_PROPERTY(BlueprintReadWrite)
  std::string SfxBolt = "Assets/Audio/S_Bolt.hbaudioasset.json";  // 마탄
  HB_PROPERTY(BlueprintReadWrite)
  std::string SfxBoom = "Assets/Audio/S_Boom.hbaudioasset.json";  // 마탄 폭발
  HB_PROPERTY(BlueprintReadWrite)
  std::string SfxHit = "Assets/Audio/S_Hit.hbaudioasset.json";  // 적중
  HB_PROPERTY(BlueprintReadWrite)
  std::string SfxKill = "Assets/Audio/S_Kill.hbaudioasset.json";  // 해골 쓰러짐
  HB_PROPERTY(BlueprintReadWrite)
  std::string SfxHurt = "Assets/Audio/S_Hurt.hbaudioasset.json";  // 플레이어 피격
  HB_PROPERTY(BlueprintReadWrite)
  std::string SfxCoin = "Assets/Audio/S_Coin.hbaudioasset.json";  // 골드·구매
  HB_PROPERTY(BlueprintReadWrite)
  std::string SfxDodge = "Assets/Audio/S_Dodge.hbaudioasset.json";  // 회피
  HB_PROPERTY(BlueprintReadWrite)
  std::string SfxDoorHit = "Assets/Audio/S_DoorHit.hbaudioasset.json";  // 잠긴 문 때림
  HB_PROPERTY(BlueprintReadWrite)
  std::string SfxDoorOpen = "Assets/Audio/S_DoorOpen.hbaudioasset.json";  // 문 열림
  HB_PROPERTY(BlueprintReadWrite)
  std::string SfxFlash = "Assets/Audio/S_Flash.hbaudioasset.json";  // 섬광탄
  HB_PROPERTY(BlueprintReadWrite)
  std::string SfxCraft = "Assets/Audio/S_Craft.hbaudioasset.json";  // 제작
  HB_PROPERTY(BlueprintReadWrite)
  std::string SfxGather = "Assets/Audio/S_Gather.hbaudioasset.json";  // 채집
  HB_PROPERTY(BlueprintReadWrite)
  std::string SfxSelect = "Assets/Audio/S_Select.hbaudioasset.json";  // 선택·대사 넘김
  HB_PROPERTY(BlueprintReadWrite)
  std::string SfxBossCharge = "Assets/Audio/S_BossCharge.hbaudioasset.json";  // 해골 대장 돌진 예고
  HB_PROPERTY(BlueprintReadWrite)
  std::string HubMusic = "Assets/Audio/S_BGM_Hub.hbaudioasset.json";  // 거점 배경음
  HB_PROPERTY(BlueprintReadWrite)
  std::string DungeonMusic = "Assets/Audio/S_BGM_Dungeon.hbaudioasset.json";  // 던전 배경음
  HB_PROPERTY(BlueprintReadWrite)
  std::string BossMusic = "Assets/Audio/S_BGM_Boss.hbaudioasset.json";  // 보스방 배경음
  HB_PROPERTY(BlueprintReadWrite)
  std::string ReturnMusic = "Assets/Audio/S_BGM_Return.hbaudioasset.json";  // 귀환 배경음
  // 소리는 C++가 이벤트만 부르고 BP가 Play Sound로 재생한다 (BP_TopDownShooter 이벤트 그래프)
  HB_FUNCTION(BlueprintImplementableEvent, DisplayName="효과음 재생", Category="소리")
  void OnPlaySfx(const std::string& Sound);
  HB_FUNCTION(BlueprintImplementableEvent, DisplayName="배경음 바꾸기", Category="소리")
  void OnPlayMusic(const std::string& Music,const std::string& Previous);
private:
  void Hud(hb::Actor* player);
  void Fire(const std::vector<hb::Actor*>& bullets,const hb::Vec3& from,const hb::Vec3& dir);
  void Damage(hb::Actor* player,int amount);
  void Animate(hb::Actor* player,float delta,bool moving);
  void EnterRoom(int index,const std::vector<hb::Actor*>& enemies,const std::vector<hb::Actor*>& doors,const std::vector<hb::Actor*>& boss);
  void UpdateReturn(hb::Actor* player,const hb::Vec3& position,const std::vector<hb::Actor*>& enemies,const std::vector<hb::Actor*>& doors);
  void DropCoin(const std::vector<hb::Actor*>& items,const hb::Vec3& at,int value);
  void Interact(hb::Actor* player,const hb::Vec3& position,const std::vector<hb::Actor*>& items,bool pressed);
  void Settle(hb::Actor* player);
  struct Line{std::string who,name,text;};
  void Say(const std::vector<Line>& lines);
  bool UpdateDialog(hb::Actor* player,float delta,bool advance);  // 대화 중이면 true
  bool UpdateIntro(hb::Actor* player,float delta,bool anyKey);    // 로딩·타이틀 중이면 true
  void HubInteract(hb::Actor* player,const hb::Vec3& position,bool pressed);
  void Craft(hb::Actor* player,bool open,int pick,bool confirm);
  void CraftDetail(hb::Actor* player);
  float WeaponDamage() const;
  int Weight() const{return Ore*30+Herb*5+Monster*15;}
  void StunAll(const std::vector<hb::Actor*>& enemies,float seconds);
  bool UpdateBoss(hb::Actor* player,float delta,const std::vector<hb::Actor*>& bullets,const std::vector<hb::Actor*>& enemies);
  // 장면 나누기: 거점·던전 방마다 장면이 따로라서, 다른 구역으로 넘어갈 때 상태를 파일에 적고 장면을 연다
  void SaveAndOpen(hb::Actor* player,const hb::Vec3& position,int area,const std::vector<hb::Actor*>& items);
  bool Restore(hb::Actor* player);
  void MoveCamera(hb::Actor* camera,const hb::Vec3& position,const hb::Vec3& aim,bool hasAim,float delta);
  int area=0;bool introHidden=false,leaving=false,oreTaken=false,herbTaken=false;
  hb::Vec3 cameraAt{0,0,0};bool cameraReady=false;
  // 셰리·알레아 공격: 플레이어 탄(shots 풀)
  void Shoot(const std::vector<hb::Actor*>& shots,const hb::Vec3& from);
  void UpdateShots(hb::Actor* player,float delta,const std::vector<hb::Actor*>& shots,const std::vector<hb::Actor*>& enemies,const std::vector<hb::Actor*>& doors,const std::vector<hb::Actor*>& items);
  bool HitEnemy(hb::Actor* e,const hb::Vec3& push,float damage,const std::vector<hb::Actor*>& enemies,const std::vector<hb::Actor*>& items);
  void ShowSelect(hb::Actor* player,bool visible);
  std::map<hb::Actor*,float> shotLife;
  std::map<hb::Actor*,bool> shotBoom;
  float charge=0;bool selecting=false;int pick=0,pickHeld=0;
  // 엔딩 카드·부스 운영 (기획서 10장)
  void ShowEnding(hb::Actor* player);
  void ResetToTitle();
  bool ending=false,anyHeld=true,rotShown=false;
  float idleTime=0;
  // 화면 없는 검사기(tools/run-project.mjs)는 소리 노드를 실행하지 못해서 tools/check_demo.mjs가 AURIC_MUTE를 켠다
  bool Muted() const{return std::getenv("AURIC_MUTE")!=nullptr;}
  void Sfx(const std::string& sound){if(!sound.empty()&&!Muted())OnPlaySfx(sound);}
  std::string currentMusic;
  float runTime=0;bool gatherTold=false;
  bool touchMode=false;  // 모바일: 공격 버튼(K)을 쓰면 켜지고 마우스 클릭하면 꺼짐. 켜지면 자동 조준
  void SetDoors(const std::vector<hb::Actor*>& doors,int room,bool locked);
  float attackCooldown=0,dodgeTime=0,dodgeCooldown=0,invulnerable=0,gameOver=0;
  bool dodgeHeld=false,started=false,hudDirty=true;
  float attackAnim=0,walkTime=0,slashTime=0;
  std::string currentSprite;
  hb::Actor* slashFx=nullptr;
  int frame=0,fatigueLevel=0;  // fatigueLevel: 지금 보이는 피로도 그림(10% 단위)
  hb::Vec3 facing{1,0,0};
  std::map<hb::Actor*,float> enemyHp,stun,shotTimer,lifetime;
  std::map<int,int> roomState;  // 0 처음, 1 전투 중(문 잠김), 2 클리어
  int fightingRoom=-1,returnRoom=-1;
  bool returnHeld=false,flashHeld=false;
  std::map<hb::Actor*,int> coinValue;
  std::string hint;
  bool craftOpen=false,craftKeyHeld=false,confirmHeld=false;
  int craftPick=1;
  std::map<hb::Actor*,float> burn;
  std::vector<Line> dialog;
  size_t dialogIndex=0,shownChars=0;float typeTime=0,phaseTime=0;std::string shownWho;
  bool advanceHeld=true,bossIntro=false;
  hb::Actor* bossActor=nullptr;
  int bossPattern=0,bossStep=0;
  float bossTimer=0;
  hb::Vec3 bossDash{0,0,0};
};
