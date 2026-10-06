#pragma once
#include <HBEngine/Game.hpp>
#include <map>
#include <set>
#include <string>
#include <vector>
#include <cstdlib>

// Auric Loop 게임 규칙. 언리얼처럼 C++는 계산만 맡고, 수치·그림·소리·배치는 BP 기본값과 장면에서 고친다.
//   TopDownShooter (BP_TopDownShooter): 플레이어·전투·정산·UI 흐름 (게임 모드 역할, 장면마다 Director 하나)
//   Enemy          (BP_Enemy → BP_Skeleton / BP_SkeletonMage / BP_SkeletonCaptain): 적 수치. 행동은 상태 머신(Assets/AI/FSM_*)이 정하고
//                  상태마다 BP 사용자 이벤트가 아래 Enemy 함수를 부른다
//   Interactable   (BP_Interactable): E로 쓰는 것 (NPC·가구·채집물·상점). 문구·가격은 배치한 오브젝트마다 덮어쓴다
//   Dungeon        (Dungeon.h): 던전에 들어올 때마다 방을 무작위로 잇고 장면 풀로 바닥·벽을 깐다 (방·웨이브는 Assets/Data)
//   RoomInfo       (BP_RoomInfo): 이 장면이 어떤 구역인지 (거점 / 던전 방 번호, 크기, 종류)

class TopDownShooter;

// ---- 던전 층 (엔진이 BP에 연결된 C++ 파일만 컴파일해서 같은 파일에 둠) ----
// 던전 한 층을 엔터 더 건전·소울 나이트처럼 매번 무작위로 만든다.
//   1) 시작 방에서 격자 위로 가지를 뻗어 나무 모양(갈림길·막다른 방)으로 잇고, 가장 먼 막다른 방을 보스로 (Generate)
//   2) 방·복도의 바닥과 벽은 장면(Dungeon)에 화면 밖으로 세워 둔 반복 무늬 스프라이트를 옮기고 크기만 바꿔 깐다 (Build)
// 방 종류·크기·웨이브는 데이터 에셋(Assets/Data/DA_Floor, DT_Rooms)에서 고친다.

struct DungeonRoom{
  std::string kind;              // Start, Combat, Gather, Shop, Boss
  std::string row;               // DT_Rooms 행 이름 (Combat1, Branch, …)
  int gx=0,gy=0;                 // 격자 칸
  float cx=0,cy=0,hw=6,hh=6;     // 가운데, 반너비·반높이 (m)
  int path=-1;                   // 시작→보스 최단 경로에서의 순서 (경로 밖 방은 -1)
  int depth=0;                   // 시작 방에서 몇 방 떨어졌는지
  int layout=0;                  // 엄폐물 배치 (Dungeon::Build)
  bool seen=false,visited=false; // 미니맵: 들어간 방과 그 이웃만 보임
  int link[4]={-1,-1,-1,-1};     // 북·동·남·서로 이어진 방 번호
  int state=0;                   // 0 처음, 1 전투 중, 2 끝
  bool returned=false;           // 귀환 페이즈에 지나감
  std::vector<hb::Vec3> blocked; // 기둥 자리 (적 등장 자리에서 뺌)
  bool Inside(const hb::Vec3& p,float margin=0) const{
    return p.x>cx-hw+margin&&p.x<cx+hw-margin&&p.y>cy-hh+margin&&p.y<cy+hh-margin;}
};

class Dungeon{
public:
  std::vector<DungeonRoom> rooms;
  int start=0,boss=-1;
  hb::Actor* stairs=nullptr;     // 시작 방의 거점 계단

  // floor: DA_Floor (rooms 방 수, loops 고리 수, spacing 격자 간격), table: DT_Rooms 전체 (행 → minHalf, maxHalf, waves …)
  void Generate(unsigned seed,const hb::Json& floor,const hb::Json& table);
  void Build();
  int RoomAt(const hb::Vec3& p) const;                       // 방 안이면 번호, 복도·밖이면 -1
  int PathRoom(int order) const;                             // 주 경로 order번째 방
  hb::Vec3 DoorPosition(int room,int dir) const;             // 문 자리 (방 가장자리 가운데)
  void Lock(int room,bool locked,int only=-1);               // 방 문 잠그기 (only: 그 방향 하나만)
  bool Locked(int room,int dir) const{return gates[room*4+dir]!=nullptr;}
  hb::Json Describe() const;                                 // 검사·디버그용 배치 요약

  static constexpr int dx[4]={0,1,0,-1},dy[4]={1,0,-1,0};
private:
  std::vector<hb::Actor*> gates;                             // 방*4+방향 → 잠긴 문 (열리면 nullptr)
  std::vector<hb::Actor*> gateFree,sideFree;                 // 남은 철창 (위·아래 문용, 옆문용)
};


HB_CLASS(Blueprintable)
class Enemy : public hb::Actor {
public:
  HB_PROPERTY(BlueprintReadWrite)
  float MaxHp = 3.5f;             // 검 4대 (기획서 5장)
  HB_PROPERTY(BlueprintReadWrite)
  float Speed = 4.8f;             // 플레이어보다 20% 느림
  HB_PROPERTY(BlueprintReadWrite)
  int ContactDamage = 1;
  HB_PROPERTY(BlueprintReadWrite)
  float Radius = 0.4f;            // 몸 반지름: 접촉 피해(반지름+0.35m)·보스 피격 판정에 더함
  HB_PROPERTY(BlueprintReadWrite)
  float KeepDistance = 0;         // 0이면 근거리. 원거리는 이 거리를 유지하며 쏜다
  HB_PROPERTY(BlueprintReadWrite)
  float ShotInterval = 2.0f;
  HB_PROPERTY(BlueprintReadWrite)
  int ShotCount = 3;
  HB_PROPERTY(BlueprintReadWrite)
  float ShotSpread = 15.0f;
  HB_PROPERTY(BlueprintReadWrite)
  float ShotSpeed = 7.0f;
  HB_PROPERTY(BlueprintReadWrite)
  int GoldMin = 1;
  HB_PROPERTY(BlueprintReadWrite)
  int GoldMax = 3;
  HB_PROPERTY(BlueprintReadWrite)
  bool Boss = false;
  HB_PROPERTY(BlueprintReadWrite)
  std::string DisplayName = "";
  HB_PROPERTY(BlueprintReadWrite)
  std::string Brain = "Assets/AI/FSM_Skeleton.hbstatemachine.json";  // 행동 상태 머신
  // 보스 패턴 (해골 대장): 돌진 → 원형 탄막 2회 → 졸개 소환. 순서·시간은 상태 머신에서 고친다
  HB_PROPERTY(BlueprintReadWrite)
  float DashSpeed = 14.0f;
  HB_PROPERTY(BlueprintReadWrite)
  int RingCount = 12;
  HB_PROPERTY(BlueprintReadWrite)
  int SummonCount = 2;
  HB_PROPERTY(BlueprintReadWrite)
  std::string SummonBlueprint = "Assets/Blueprints/Enemies/BP_Skeleton.hbblueprint.json";
  HB_PROPERTY(BlueprintReadWrite)
  float Hp = 0;
  HB_PROPERTY(BlueprintReadWrite)
  bool Invulnerable = false;      // 귀환 중 해골은 무적 (기획서 6-3)
  HB_PROPERTY(BlueprintReadWrite)
  std::string DeathClip = "Assets/Animations/SA_Skeleton_Death.hbspriteanimation.json";  // 쓰러지는 애니메이션 (이펙트로 재생)
  HB_PROPERTY(BlueprintReadWrite)
  std::string ShotClip = "";      // 이 적이 쏘는 탄 그림 (비우면 BP_AuricRules.EnemyShotClip)

  // 상태 머신이 상태에 들어갈 때 BP 사용자 이벤트가 한 번 부른다 (매 프레임 부르지 않음: C++ 호출 비용)
  HB_FUNCTION(BlueprintCallable, DisplayName="생성", Category="적")
  void Awake();
  HB_FUNCTION(BlueprintCallable, DisplayName="등장·멈춤", Category="적")
  void Halt();
  HB_FUNCTION(BlueprintCallable, DisplayName="추격", Category="적")
  void Chase();
  HB_FUNCTION(BlueprintCallable, DisplayName="거리 유지", Category="적")
  void Range();
  HB_FUNCTION(BlueprintCallable, DisplayName="경직", Category="적")
  void Stagger();
  HB_FUNCTION(BlueprintCallable, DisplayName="공격 예고", Category="적")
  void Windup();
  HB_FUNCTION(BlueprintCallable, DisplayName="탄 발사", Category="적")
  void Fire();
  HB_FUNCTION(BlueprintCallable, DisplayName="돌진", Category="적")
  void Dash();
  HB_FUNCTION(BlueprintCallable, DisplayName="원형 탄막", Category="적")
  void Ring();
  HB_FUNCTION(BlueprintCallable, DisplayName="졸개 소환", Category="적")
  void Summon();

  // 게임 규칙(TopDownShooter)이 직접 부른다 (같은 C++ 빌드라 실제 객체). Tick은 게임 규칙의 한 프레임 호출 안에서 모든 적을 한 번에 움직인다
  void Tick(float delta);
  bool TakeHit(float damage,const hb::Vec3& push,float stunSeconds,float burnSeconds);  // 쓰러지면 true
  void Stun(float seconds);
  float burnLeft=0,burnDamage=0;
  bool burnedOut=false;          // 화상으로 체력이 다함 (게임 규칙이 처리)
  bool Parked=false;             // 장면에 화면 밖으로 대기 중 (게임 규칙이 꺼내 씀, 실행 중 생성은 끊김)
  bool brainRunning=false;       // 상태 머신이 돌고 있음 (멈춘 상태 머신에 Stop·파라미터를 보내면 엔진 오류)
  bool Flipped() const{return flipped;}
private:
  hb::Vec3 ToPlayer(float& distance) const;
  enum class Mode{Halt,Chase,Range,Stagger,Dash};
  Mode mode=Mode::Halt;
  float stun=0,flash=0,shotTimer=0;
  bool sentStunned=false,sentReady=false,sentNear=false,flipped=false;  // 엔진 명령은 값이 바뀔 때만 보낸다 (호출 비용)
  hb::Vec3 sentVelocity{9e9f,0,0};
  int velocityAge=0,stuckAge=0;
  float detour=0;hb::Vec3 detourDir{0,0,0};  // 엄폐물에 막히면 잠깐 옆으로 돌아감
  int ring=0,pattern=0;
  hb::Vec3 dashDir{0,-1,0};
};

HB_CLASS(Blueprintable)
class Interactable : public hb::Actor {
public:
  HB_PROPERTY(BlueprintReadWrite)
  std::string Kind = "Note";     // Note·DebtBoard·Entrance·Collector·Interior·Sofa·Smith·Stall·Ore·Herb
  HB_PROPERTY(BlueprintReadWrite)
  std::string Text = "";         // 다가가면 위에 뜨는 문구 (Note는 이 문구만)
  HB_PROPERTY(BlueprintReadWrite)
  int Price = 0;
  HB_PROPERTY(BlueprintReadWrite)
  float Range = 2.2f;
};

HB_CLASS(Blueprintable)
class RoomInfo : public hb::Actor {
public:
  HB_PROPERTY(BlueprintReadWrite)
  int Index = -1;                // -1 거점, 0 던전
  HB_PROPERTY(BlueprintReadWrite)
  std::string Kind = "Hub";      // Hub·Dungeon (던전은 들어올 때마다 방을 무작위로 만듦)
  HB_PROPERTY(BlueprintReadWrite)
  float ExitY = 21;              // 거점: 이보다 위(계단 끝)로 가면 던전
};

HB_CLASS(Blueprintable)
class AuricRules : public hb::Actor {
public:
  // 밸런스·에셋 경로 (기획서 4·5·6장). BP_AuricRules 기본값 한 곳에서 고치면 모든 장면에 적용된다
  HB_PROPERTY(BlueprintReadWrite)
  float InvulnerableTime = 1.2f;  // 맞은 뒤 무적 (깜빡임)
  HB_PROPERTY(BlueprintReadWrite)
  float HurtKnockback = 9.0f;      // 맞으면 밀려나는 속도 (0.12초)
  HB_PROPERTY(BlueprintReadWrite)
  float DodgeTime = 1.0f;
  HB_PROPERTY(BlueprintReadWrite)
  float DodgeSpeed = 12.0f;
  HB_PROPERTY(BlueprintReadWrite)
  float DodgeCooldown = 2.0f;
  HB_PROPERTY(BlueprintReadWrite)
  float SwordDamage = 1.0f;
  HB_PROPERTY(BlueprintReadWrite)
  float SwordInterval = 0.35f;
  HB_PROPERTY(BlueprintReadWrite)
  float SwordRange = 2.5f;
  HB_PROPERTY(BlueprintReadWrite)
  float SwordHalfAngle = 50.0f;
  HB_PROPERTY(BlueprintReadWrite)
  float HitStun = 0.18f;          // 맞으면 잠깐 멈추고 맞는 그림 (보스 제외)
  HB_PROPERTY(BlueprintReadWrite)
  float Knockback = 7.0f;
  HB_PROPERTY(BlueprintReadWrite)
  float MoveSpeed = 6.0f;         // 플레이어 이동 속도 (무거우면 SlowRate를 곱함)         // 맞은 적이 밀려나는 속도 (m/s, 보스 제외)
  HB_PROPERTY(BlueprintReadWrite)
  float ShakeTime = 0.1f;         // 때렸을 때 화면 흔들림
  HB_PROPERTY(BlueprintReadWrite)
  float ShakeAmount = 0.08f;
  HB_PROPERTY(BlueprintReadWrite)
  float ArrowCharge = 1.0f;
  HB_PROPERTY(BlueprintReadWrite)
  float ArrowDamage = 3.5f;
  HB_PROPERTY(BlueprintReadWrite)
  float ArrowSpeed = 20.0f;
  HB_PROPERTY(BlueprintReadWrite)
  float BoltInterval = 0.15f;
  HB_PROPERTY(BlueprintReadWrite)
  float BoltDamage = 0.5f;
  HB_PROPERTY(BlueprintReadWrite)
  float BoltSpeed = 13.0f;
  HB_PROPERTY(BlueprintReadWrite)
  float BoomRadius = 1.4f;
  HB_PROPERTY(BlueprintReadWrite)
  float BoomDamage = 0.5f;
  HB_PROPERTY(BlueprintReadWrite)
  float EnemyShotLife = 3.0f;
  HB_PROPERTY(BlueprintReadWrite)
  float EnemyShotHit = 0.45f;
  HB_PROPERTY(BlueprintReadWrite)
  float PlayerShotLife = 1.6f;
  HB_PROPERTY(BlueprintReadWrite)
  float PlayerShotHit = 0.7f;
  HB_PROPERTY(BlueprintReadWrite)
  float UpgradeBonus = 0.15f;
  HB_PROPERTY(BlueprintReadWrite)
  float EnchantPower = 0.3f;
  HB_PROPERTY(BlueprintReadWrite)
  float BurnTime = 3.0f;
  HB_PROPERTY(BlueprintReadWrite)
  float BurnRate = 0.1f;
  HB_PROPERTY(BlueprintReadWrite)
  float SlashExtend = 1.5f;
  HB_PROPERTY(BlueprintReadWrite)
  float EnterDepth = 1.5f;       // 방 가장자리에서 이만큼 들어오면 문이 잠기고 적이 나옴
  HB_PROPERTY(BlueprintReadWrite)
  float SpawnWarn = 0.9f;        // 적이 나오기 전 마법진 예고 시간
  HB_PROPERTY(BlueprintReadWrite)
  float RespawnDelay = 3.0f;
  HB_PROPERTY(BlueprintReadWrite)
  int SofaMax = 3;
  HB_PROPERTY(BlueprintReadWrite)
  int HomeFatigueBonus = 5;
  HB_PROPERTY(BlueprintReadWrite)
  float RepayRate = 0.5f;
  HB_PROPERTY(BlueprintReadWrite)
  int OrePrice = 40;
  HB_PROPERTY(BlueprintReadWrite)
  int HerbPrice = 5;
  HB_PROPERTY(BlueprintReadWrite)
  int MonsterPrice = 30;
  HB_PROPERTY(BlueprintReadWrite)
  int WeightLimit = 100;
  HB_PROPERTY(BlueprintReadWrite)
  float SlowRate = 0.75f;
  HB_PROPERTY(BlueprintReadWrite)
  int FlashPrice = 10;
  HB_PROPERTY(BlueprintReadWrite)
  float FlashStun = 1.0f;
  HB_PROPERTY(BlueprintReadWrite)
  int DoorHitsToOpen = 10;
  HB_PROPERTY(BlueprintReadWrite)
  int ArrowDoorHits = 3;
  HB_PROPERTY(BlueprintReadWrite)
  float DoorStun = 1.0f;
  HB_PROPERTY(BlueprintReadWrite)
  float DoorReach = 2.5f;
  HB_PROPERTY(BlueprintReadWrite)
  float CoinMagnet = 3.0f;
  HB_PROPERTY(BlueprintReadWrite)
  float CoinPickup = 0.7f;
  HB_PROPERTY(BlueprintReadWrite)
  float LoadingTime = 1.2f;
  HB_PROPERTY(BlueprintReadWrite)
  float TypeSpeed = 30.0f;       // 대화 글자/초
  HB_PROPERTY(BlueprintReadWrite)
  float CameraLead = 0.25f;      // 조준 쪽으로 화면을 끌어당기는 비율
  HB_PROPERTY(BlueprintReadWrite)
  float CameraLeadMax = 3.0f;
  HB_PROPERTY(BlueprintReadWrite)
  float CameraFollow = 8.0f;
  HB_PROPERTY(BlueprintReadWrite)
  float AutoAimRange = 12.0f;    // 모바일 자동 조준
  HB_PROPERTY(BlueprintReadWrite)
  float IdleReset = 60.0f;       // 부스: 입력이 없으면 처음으로
  HB_PROPERTY(BlueprintReadWrite)
  float RunNotice = 600.0f;      // 부스: 10분이 지나면 보스방 앞 이동 안내

  // ---- 에셋 경로 ----
  // 배열 기본값은 BP_TopDownShooter 기본값에 있다 (C++ 문법과 JSON 기본값을 같이 쓸 수 없어서 C++ 쪽은 비워 둠)
  HB_PROPERTY(BlueprintReadWrite)
  std::vector<int> Debts;                    // 캐릭터별 빚: 발렌, 셰리, 알레아 (기획서 6-4)
  HB_PROPERTY(BlueprintReadWrite)
  std::vector<std::string> CharacterSprites; // 캐릭터별 스프라이트 앞부분: + 방향(S/SE/E/NE/N) + _Idle_0 / _Walk_0~3 / _Attack_0~2 + .hbsprite.json
  HB_PROPERTY(BlueprintReadWrite)
  std::vector<std::string> Sounds;           // "이름=오디오 에셋 경로". 효과음 Slash·Arrow·… / 배경음 Hub·Dungeon·Boss·Return
  HB_PROPERTY(BlueprintReadWrite)
  std::string ArrowClip = "Assets/Animations/SA_Arrow.hbspriteanimation.json";      // 셰리 화살 (날아가는 동안 반복)
  HB_PROPERTY(BlueprintReadWrite)
  std::string CardClip = "Assets/Animations/SA_Card.hbspriteanimation.json";        // 알레아 마탄 카드
  HB_PROPERTY(BlueprintReadWrite)
  std::string BoomClip = "Assets/Animations/SA_Boom.hbspriteanimation.json";        // 마탄 폭발
  HB_PROPERTY(BlueprintReadWrite)
  std::string EnemyShotClip = "Assets/Animations/SA_EnemyOrb.hbspriteanimation.json";  // 적 탄 (적마다 Enemy.ShotClip으로 바꿀 수 있음)
  HB_PROPERTY(BlueprintReadWrite)
  std::string CoinClip = "Assets/Animations/SA_Coin.hbspriteanimation.json";
  HB_PROPERTY(BlueprintReadWrite)
  std::string EnemyShotPrefab = "Assets/Prefabs/PF_EnemyShot.hbprefab.json";
  HB_PROPERTY(BlueprintReadWrite)
  std::string PlayerShotPrefab = "Assets/Prefabs/PF_PlayerShot.hbprefab.json";
  HB_PROPERTY(BlueprintReadWrite)
  std::string CoinPrefab = "Assets/Prefabs/PF_Coin.hbprefab.json";
  HB_PROPERTY(BlueprintReadWrite)
  std::string FxPrefab = "Assets/Prefabs/PF_Fx.hbprefab.json";       // 베기·타격·쓰러짐 이펙트 (풀 Pool.Fx가 모자랄 때만 생성)
  HB_PROPERTY(BlueprintReadWrite)
  std::string SlashClip = "Assets/Animations/SA_Slash.hbspriteanimation.json";  // 오른쪽으로 베는 그림을 공격 방향으로 돌림
  HB_PROPERTY(BlueprintReadWrite)
  std::string HitClip = "Assets/Animations/SA_Hit.hbspriteanimation.json";
  HB_PROPERTY(BlueprintReadWrite)
  std::string HubScene = "Assets/Scenes/Hub.hbscene.json";
  HB_PROPERTY(BlueprintReadWrite)
  std::string DungeonScene = "Assets/Scenes/Dungeon.hbscene.json";
  HB_PROPERTY(BlueprintReadWrite)
  std::string FloorData = "Assets/Data/DA_Floor.hbdata.json";     // 방 순서·곁가지·간격
  HB_PROPERTY(BlueprintReadWrite)
  std::string RoomTable = "Assets/Data/DT_Rooms.hbdata.json";     // 방 종류별 크기·웨이브 (적 기호는 Enemies)
  HB_PROPERTY(BlueprintReadWrite)
  std::string SpawnClip = "Assets/Animations/SA_Spawn.hbspriteanimation.json";  // 적 등장 예고 마법진
  HB_PROPERTY(BlueprintReadWrite)
  std::string DialogueTable = "Assets/Data/DT_Dialogue.hbdata.json";  // 대사 (행마다 lines: [{who, name, text}], {변수} 치환)
  HB_PROPERTY(BlueprintReadWrite)
  std::vector<std::string> Enemies;          // "기호=BP 경로". 웨이브 문자열의 S·M·C가 어떤 적인지
};

HB_CLASS(Blueprintable)
class TopDownShooter : public hb::Actor {
public:
  HB_FUNCTION(BlueprintCallable, KoreanName="게임 규칙 한 프레임", Category="탑다운 슈터")
  void Update(float delta);
  static TopDownShooter* Current;  // 같은 장면의 적이 플레이어·탄·피해를 쓰려고 찾는다

  // ---- 진행 상태 (검사·편집기 확인용으로 공개) ----
  HB_PROPERTY(BlueprintReadWrite)
  int FatigueMax = 20;           // 피로도 한계. 기획 100, 데모 20 (기획서 4-1)
  HB_PROPERTY(BlueprintReadWrite)
  int Fatigue = 0;
  HB_PROPERTY(BlueprintReadWrite)
  int Hp = 0;
  HB_PROPERTY(BlueprintReadWrite)
  int MaxHp = 3;
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
  int Seed = 0;                  // 던전 배치 씨앗. 0이면 들어갈 때마다 무작위 (검사용 BP는 고정)
  HB_PROPERTY(BlueprintReadWrite)
  std::string Layout = "";       // 지금 던전 방 목록 (검사·디버그용 JSON)
  HB_PROPERTY(BlueprintReadWrite)
  std::string StartRoom = "";
  HB_PROPERTY(BlueprintReadWrite)
  bool ShowFps = false;
  HB_PROPERTY(BlueprintReadWrite)
  bool KnockedOut = false;       // 던전에서 쓰러져 끌려 나옴 (소재를 잃고 정산)          // 왼쪽 위에 초당 프레임·프레임 시간 (F3으로 켜고 끔)    // 검사·시연용: 던전에 들어오면 이 종류(Gather·Shop·Boss…)의 첫 방으로 바로 감
  HB_PROPERTY(BlueprintReadWrite)
  float BossHp = 0;
  HB_PROPERTY(BlueprintReadWrite)
  bool HasReturnItem = false;
  HB_PROPERTY(BlueprintReadWrite)
  bool Returning = false;
  HB_PROPERTY(BlueprintReadWrite)
  bool ReturnSuccess = false;
  HB_PROPERTY(BlueprintReadWrite)
  int DoorHits = 0;
  HB_PROPERTY(BlueprintReadWrite)
  int Flashbangs = 0;
  HB_PROPERTY(BlueprintReadWrite)
  int Gold = 0;
  HB_PROPERTY(BlueprintReadWrite)
  int Ore = 0;
  HB_PROPERTY(BlueprintReadWrite)
  int Herb = 0;
  HB_PROPERTY(BlueprintReadWrite)
  int Monster = 0;
  HB_PROPERTY(BlueprintReadWrite)
  int Bottle = 1;
  HB_PROPERTY(BlueprintReadWrite)
  int WeaponLevel = 0;
  HB_PROPERTY(BlueprintReadWrite)
  int Debt = 9800;
  HB_PROPERTY(BlueprintReadWrite)
  int LastRepaid = 0;
  HB_PROPERTY(BlueprintReadWrite)
  int Enchant = 0;               // 각인: 0 없음, 1 증폭, 2 화상, 3 검기·관통
  HB_PROPERTY(BlueprintReadWrite)
  int Crafted = 0;
  HB_PROPERTY(BlueprintReadWrite)
  int SofaLevel = 0;
  HB_PROPERTY(BlueprintReadWrite)
  int HomeLevel = 1;
  HB_PROPERTY(BlueprintReadWrite)
  int Phase = 0;                 // 0 로딩, 1 타이틀·캐릭터 선택, 2 게임
  HB_PROPERTY(BlueprintReadWrite)
  int Character = 0;             // 0 발렌(검), 1 셰리(활), 2 알레아(마탄)
  HB_PROPERTY(BlueprintReadWrite)
  bool KeepProgress = false;     // 빚·원룸 업그레이드를 저장해 다음 실행에 이어감 (부스에선 끔)

  // ---- 적(Enemy)이 부르는 것 ----
  hb::Vec3 PlayerPosition() const{return playerAt;}
  Enemy* SpawnEnemy(const std::string& blueprint,const hb::Vec3& at,bool invulnerable);  // 대기 중인 적을 꺼냄 (없으면 생성)
  bool DamagePlayer(int amount,const hb::Vec3& from);  // 맞았으면 true (무적·회피 중이면 false)
  void FireBullets(const hb::Vec3& from,const hb::Vec3& dir,int count,float spread,float speed,const std::string& clip="");
  std::string Sound(const std::string& name) const;  // Sounds에서 이름으로 찾은 경로 (없으면 "")
  void Sfx(const std::string& name){const auto s=Sound(name);if(!s.empty())hb::Audio::Play(s);}  // 첫 입력 전 효과음은 엔진이 버림
  void Say(const std::string& who,const std::string& name,const std::string& text){dialog.push_back({who,name,text});}
  void Talk(const std::string& row,const std::map<std::string,std::string>& vars={});  // DT_Dialogue 행의 대사를 차례로
  bool Frozen() const{return Hp<=0||dialogIndex<dialog.size()||Phase<2;}  // 쓰러짐·대화·타이틀 중엔 적도 멈춤

private:
  struct Line{std::string who,name,text;};
  // 흐름
  void Begin();                    // 장면 첫 프레임: 구역 확인·상태 이어받기
  void SaveRun();
  bool LoadRun();
  void Leave(int to,const std::string& spawn);
  // 던전 (Dungeon.h): 들어오면 층을 만들고, 방에 들어서면 문이 잠기며 웨이브가 마법진 예고 뒤 나온다
  void StartFloor();
  void UpdateMinimap();          // 미니맵: 들어간 방과 그 이웃만, 지금 방은 금색 (HUD MapRoom*/MapLink*)
  void EnterRoom(int room);
  void SpawnWave(const std::string& wave,bool invulnerable);
  void UpdateWaves(float delta);
  void Warp(int room);           // 그 방 가운데로 (지나친 경로 방은 클리어 처리). 부스 F9·F10, 검사용
  void StartReturnRoom(int room);
  void HitReturnGate(const hb::Vec3& at,float reach,int hits);
  void ClearRoom();
  void Settle();
  bool UpdateSettle(float delta,bool advance);  // 정산 화면이 떠 있으면 true (이동·행동 막음)
  void ShowSettle(bool visible);
  void ShowEnding();
  void ResetToTitle();
  // 전투
  std::vector<Enemy*> Enemies() const;                       // 나와 있는 적 (대기 중인 적은 뺌)
  void ParkEnemy(Enemy* e);                                  // 화면 밖 대기로 되돌림
  void Slash(const hb::Vec3& position,const std::vector<Enemy*>& enemies);
  void Shoot(const hb::Vec3& from);
  void UpdateShots(float delta,const std::vector<Enemy*>& enemies);
  void UpdateBullets(float delta,const hb::Vec3& position);
  bool HitEnemy(Enemy* e,const hb::Vec3& push,float damage);
  void KillEnemy(Enemy* e);
  void DropCoin(const hb::Vec3& at,int value);
  void StunAll(float seconds);
  // 실행 중 생성(Scene::Spawn)은 호출마다 수십 ms가 걸려서, 장면에 미리 놓은 풀(태그 Pool.*)을 찾아 꺼내 쓴다
  void Prewarm();
  hb::Actor* Take(std::vector<hb::Actor*>& pool,const std::string& prefab,const hb::Transform& at);
  void Give(std::vector<hb::Actor*>& pool,hb::Actor* actor);  // 풀로 돌려놓기
  std::vector<hb::Actor*> bulletPool,shotPool,coinPool,fxPool;
  // 이펙트: 풀에서 꺼낸 그림 오브젝트에 프레임을 차례로 바꿔 끼운다 (베기·타격 불꽃·적 쓰러짐)
  struct Fx{hb::Actor* actor;float left;};
  std::vector<Fx> fxs;
  void PlayFx(const std::string& clip,float length,const hb::Vec3& at,float angle,float glow,bool flipX,bool flipY=false);  // glow: 블룸용 발광  // clip: 스프라이트 애니메이션, length초 뒤 풀로
  void UpdateFx(float delta);
  float WeaponDamage() const;
  int Weight() const{return Ore*30+Herb*5+Monster*15;}
  // 상호작용·UI
  void Interact(const hb::Vec3& position,bool pressed);
  void Craft(bool toggle,int pick,bool confirm);
  void CraftDetail();
  void Hud();
  void Animate(float delta,bool moving);
  bool UpdateDialog(float delta,bool advance);
  bool UpdateIntro(float delta,bool anyKey);
  void ShowSelect(bool visible);
  void MoveCamera(const hb::Vec3& position,const hb::Vec3& aim,bool hasAim,float delta);

  AuricRules* rules=nullptr;     // 장면의 BP_AuricRules (없으면 C++ 기본값)
  hb::Actor* player=nullptr;
  hb::Actor* camera=nullptr;
  hb::Vec3 playerAt{0,0,0},facing{1,0,0},cameraAt{0,0,0};
  bool playerFlipped=false,blinkShown=false;
  hb::Vec3 knock{0,0,0};
  bool cameraReady=false,started=false,leaving=false,hudDirty=true,introHidden=false;
  int rotShown=-1;                // 지금 보이는 버튼 그림 (귀환 테마*10 + 캐릭터)
  int frame=0,area=-1,fightingRoom=-1;
  std::string roomKind="Hub";
  float exitY=21;
  bool inDungeon=false,monsterDrop=false,exitArmed=false,minimapDirty=false;
  Dungeon map;
  hb::Json roomTable;                    // DT_Rooms 행들
  std::vector<std::string> waves;        // 싸우는 방의 남은 웨이브 ("S,S,M" 하나씩)
  size_t wave=0;
  int waveAlive=0;                       // 이번 웨이브에서 나와 아직 살아 있는 적 (생성 직후 한 프레임은 적 목록에 안 잡혀서 직접 셈)
  struct Pending{hb::Vec3 at;std::string blueprint;float left;bool invulnerable;};
  std::vector<Pending> pending;          // 예고 중인 적
  int returnRoom=-1,returnDir=-1;        // 귀환 중 때려 열어야 하는 문
  std::set<std::string> taken;     // 채집한 것 ("방번호:Kind")
  std::vector<Interactable*> interactables;
  float attackCooldown=0,dodgeTimer=0,dodgeCooldownLeft=0,invulnerable=0,gameOver=0,charge=0;
  float attackAnim=0,walkTime=0,shake=0,aimHold=0,sentSpeed=0,knockTimer=0,idleTime=0,runTime=0,typeTime=0,phaseTime=0;
  std::string currentSprite,currentMusic,hint,shownWho;
  std::map<hb::Actor*,float> bullets;      // 적 탄: 남은 시간
  std::map<hb::Actor*,float> shots;        // 플레이어 탄
  std::map<hb::Actor*,bool> shotBoom;
  std::map<hb::Actor*,int> coins;
  Enemy* boss=nullptr;
  std::vector<Line> dialog;
  size_t dialogIndex=0,shownChars=0;
  float fpsTime=0,fpsWorst=0;int fpsFrames=0;bool fpsHeld=false;
  // 정산 화면: 줄이 하나씩 나타나고 남은 빚이 줄어드는 숫자 연출
  std::vector<std::string> settleRows;
  float settleTime=-1;int settleShown=0,debtFrom=0,debtTo=0,debtShown=-1;bool settleDone=false;
  bool warpHeld=false,dodgeHeld=false,returnHeld=false,flashHeld=false,craftOpen=false,craftKeyHeld=false,confirmHeld=false;
  bool advanceHeld=true,selecting=false,ending=false,anyHeld=true,touchMode=false,gatherTold=false;
  int craftPick=1,pick=0,pickHeld=0;
};
