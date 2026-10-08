#pragma once
#include <HBEngine/Game.hpp>
#include <map>
#include <set>
#include <string>
#include <vector>
#include <cstdlib>
#include <cmath>

// Auric Loop 게임 규칙. 언리얼처럼 C++는 계산만 맡고, 수치·그림·소리·배치는 BP 기본값과 장면에서 고친다.
//   TopDownShooter (BP_TopDownShooter): 플레이어·전투·정산·UI 흐름 (게임 모드 역할, 장면마다 Director 하나)
//   Enemy          (BP_Enemy → BP_Skeleton / BP_SkeletonMage / BP_SkeletonCaptain): 적 수치. 행동은 상태 머신(Assets/AI/FSM_*)이 정하고
//                  상태마다 BP 사용자 이벤트가 아래 Enemy 함수를 부른다
//   Interactable   (BP_Interactable): E로 쓰는 것 (NPC·가구·채집물·상점). 문구·가격은 배치한 오브젝트마다 덮어쓴다
//   Dungeon        (Dungeon.h/.cpp): 던전에 들어올 때마다 방을 무작위로 잇고 장면 풀로 바닥·벽을 깐다 (방·웨이브는 Assets/Data)
//   RoomInfo       (BP_RoomInfo): 이 장면이 어떤 구역인지 (거점 / 던전 방 번호, 크기, 종류)
//
// 파일: BP 클래스 선언은 엔진이 이 헤더만 읽으므로 여기에 모으고, 구현은 역할별 .cpp로 나눈다 (Source/ 전체가 한 모듈로 빌드됨)
//   TopDownShooter.cpp  한 프레임(Update)·카메라      Combat.cpp    적 생성·피해·플레이어 공격·적 탄·이펙트
//   Enemy.cpp           적 행동 (상태 머신이 부름)     World.cpp     구역 전환·던전 방·웨이브·정산·메뉴·가방·대사, 살아 있는 맵(새·나비·박쥐·쥐·구름 그늘)
//   Dungeon.h/.cpp      던전 층 생성·배치               Interact.cpp  상호작용(E)·제작(Q)
//   Screen.cpp          HUD·캐릭터 그림·대화창·인트로    Common.h      여러 파일이 쓰는 수학·입력 도우미

class TopDownShooter;

#include "Dungeon.h"

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
  // 근접 공격 (KeepDistance 0인 적): 예고(붉게·바닥 표시) → 공격 → 빈틈. 닿기만 해서는 맞지 않는다
  //   베기: 가까우면 앞으로 휘두름 / 돌진 찌르기: 붉은 띠 방향으로 짧게 돌진 / 도약: 바닥 원 자리로 뛰어 내려찍음
  //   보스는 맴돌다 가까우면 대검 베기만 (돌진·점프는 상태 머신 패턴)
  HB_PROPERTY(BlueprintReadWrite)
  float MeleeWindup = 0.5f;       // 예고 시간 (초)
  HB_PROPERTY(BlueprintReadWrite)
  float AttackCooldown = 1.1f;    // 공격 사이 쉬는 시간 (초, 매번 0.8~1.3배)
  HB_PROPERTY(BlueprintReadWrite)
  float SlashRange = 1.3f;        // 베기 거리 (몸 반지름에 더함)
  HB_PROPERTY(BlueprintReadWrite)
  float LungeRange = 5.0f;        // 이 거리 안이면 돌진 찌르기 (0이면 안 씀)
  HB_PROPERTY(BlueprintReadWrite)
  float LungeSpeed = 11.0f;
  HB_PROPERTY(BlueprintReadWrite)
  float LeapRange = 6.5f;         // 이 거리 안이면 도약 내려찍기 (0이면 안 씀)
  HB_PROPERTY(BlueprintReadWrite)
  std::string AttackClip = "Assets/Animations/SA_Skeleton_Attack.hbspriteanimation.json";
  HB_PROPERTY(BlueprintReadWrite)
  std::string WalkClip = "Assets/Animations/SA_Skeleton_Walk.hbspriteanimation.json";
  HB_PROPERTY(BlueprintReadWrite)
  std::string WindupSprite = "Assets/Sprites/Enemies/Skeleton/S_Skeleton_Attack_0.hbsprite.json";  // 예고 동안 멈춰 있는 자세
  HB_PROPERTY(BlueprintReadWrite)
  std::string LungeReadySprite = "Assets/Sprites/Enemies/Skeleton/S_Skeleton_LungeReady.hbsprite.json";  // 돌진 예고 (몸을 낮추고 겨눔). tools/make_enemy_poses.py
  HB_PROPERTY(BlueprintReadWrite)
  std::string LungeSprite = "Assets/Sprites/Enemies/Skeleton/S_Skeleton_Lunge.hbsprite.json";            // 돌진 중 (앞으로 기울여 찌름)
  HB_PROPERTY(BlueprintReadWrite)
  std::string LeapCrouchSprite = "Assets/Sprites/Enemies/Skeleton/S_Skeleton_LeapCrouch.hbsprite.json";  // 도약 예고 (웅크림)
  HB_PROPERTY(BlueprintReadWrite)
  std::string LeapAirSprite = "Assets/Sprites/Enemies/Skeleton/S_Skeleton_LeapAir.hbsprite.json";        // 도약 중 (공중)
  HB_PROPERTY(BlueprintReadWrite)
  std::string LeapLandSprite = "Assets/Sprites/Enemies/Skeleton/S_Skeleton_LeapLand.hbsprite.json";      // 착지 (내려찍고 무릎) — 빈틈 동안 유지
  HB_PROPERTY(BlueprintReadWrite)
  std::string RoarClip = "";     // 보스: 등장·분노 때 포효 자세 클립 (걷기 애니메이션 위에 덮어 재생)
  // 공격 직전 반짝임 자리 "눈x,눈y;무기끝x,무기끝y" (m, 오른쪽 볼 때). tools/make_blueprints.py가 자세 그림에서 찾음
  HB_PROPERTY(BlueprintReadWrite)
  std::string GlintSlash = "";
  HB_PROPERTY(BlueprintReadWrite)
  std::string GlintLunge = "";
  HB_PROPERTY(BlueprintReadWrite)
  std::string GlintLeap = "";
  HB_PROPERTY(BlueprintReadWrite)
  std::string GlintCast = "";
  HB_PROPERTY(BlueprintReadWrite)
  std::string GlintDash = "";

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
  HB_FUNCTION(BlueprintCallable, DisplayName="보스: 맴돌기", Category="적")
  void Prowl();
  HB_FUNCTION(BlueprintCallable, DisplayName="보스: 점프 준비", Category="적")
  void JumpWindup();
  HB_FUNCTION(BlueprintCallable, DisplayName="보스: 점프", Category="적")
  void Jump();
  HB_FUNCTION(BlueprintCallable, DisplayName="보스: 내려찍기", Category="적")
  void Slam();
  HB_FUNCTION(BlueprintCallable, DisplayName="보스: 회전 베기 준비", Category="적")
  void SpinWindup();
  HB_FUNCTION(BlueprintCallable, DisplayName="보스: 회전 베기", Category="적")
  void Spin();
  HB_FUNCTION(BlueprintCallable, DisplayName="보스: 충격파 준비", Category="적")
  void QuakeWindup();
  HB_FUNCTION(BlueprintCallable, DisplayName="보스: 충격파", Category="적")
  void Quake();
  HB_FUNCTION(BlueprintCallable, DisplayName="보스: 금화 비", Category="적")
  void GoldRain();

  // 게임 규칙(TopDownShooter)이 직접 부른다 (같은 C++ 빌드라 실제 객체). Tick은 게임 규칙의 한 프레임 호출 안에서 모든 적을 한 번에 움직인다
  void Tick(float delta);
  bool TakeHit(float damage,const hb::Vec3& push,float stunSeconds,float burnSeconds);  // 쓰러지면 true
  void Stun(float seconds);
  void CancelAttack(){EndAttack();}  // 풀로 돌려보낼 때 (도약 중 꺼 둔 충돌 복구)
  void Roar(float seconds){if(RoarClip.empty())return;hb::Sprites::PlayAnimation(this,RoarClip,false);roarTime=seconds;}  // 보스 등장·분노 포효 자세
  float burnLeft=0,burnDamage=0;
  bool burnedOut=false;          // 화상으로 체력이 다함 (게임 규칙이 처리)
  bool Parked=false;             // 장면에 화면 밖으로 대기 중 (게임 규칙이 꺼내 씀, 실행 중 생성은 끊김)
  bool brainRunning=false;       // 상태 머신이 돌고 있음 (멈춘 상태 머신에 Stop·파라미터를 보내면 엔진 오류)
  bool Flipped() const{return flipped;}
  hb::Vec3 sep{0,0,0};           // 다른 적·플레이어와 겹친 만큼 벌리는 속도 (게임 규칙 Separate가 정함)
private:
  hb::Vec3 ToPlayer(float& distance) const;
  enum class Mode{Halt,Chase,Range,Stagger,Dash,Prowl,Jump,Spin};
  float spinTick=0,rainTime=0,roarTime=0;std::vector<hb::Vec3> rainSpots;hb::Vec3 quakeDir{0,-1,0};  // 보스 회전 베기·금화 비·포효
  int NextAfter(int current) const;  // 보스 패턴 순서
  void Glint(const std::string& spec,bool left);  // 공격 직전 눈·무기 끝 반짝임 (몸을 붉게 물들이는 대신)
  int dashCount=0;bool phase2=false;     // 보스: 연속 돌진 횟수, 체력 절반 아래 분노
  hb::Vec3 jumpTarget{0,0,0};
  void NextPattern(int next);
  Mode mode=Mode::Halt;
  float stun=0,flash=0,shotTimer=0;
  bool sentStunned=false,sentReady=false,sentNear=false,flipped=false;  // 엔진 명령은 값이 바뀔 때만 보낸다 (호출 비용)
  float tint=-1;  // 보낸 색: 1 흰색, 0.45 공격 예고 붉은색. 같은 색은 다시 보내지 않는다 (에디터는 색을 바꿀 때마다 그림을 다시 만듦)
  void Tint(bool warn){const float g=warn?0.45f:1.f;if(g==tint)return;tint=g;hb::Sprites::SetColor(this,hb::Color{1,g,g,1});}
  hb::Vec3 sentVelocity{9e9f,0,0};
  int velocityAge=0,stuckAge=0;
  float detour=0;hb::Vec3 detourDir{0,0,0};  // 엄폐물에 막히면 잠깐 옆으로 돌아감
  int ring=0,pattern=0;
  hb::Vec3 dashDir{0,-1,0};
  // 근접 공격 진행: atk 0 없음 1 베기 2 돌진 찌르기 3 도약, atkPhase 0 예고 1 공격 2 빈틈
  int atk=0,atkPhase=0;float atkTime=0,atkCool=0.6f,lungeTime=0;bool atkHit=false;
  hb::Vec3 atkDir{1,0,0},atkTarget{0,0,0};
  bool UpdateMelee(float delta,const hb::Vec3& dir,float distance,bool frozen);
  void EndAttack();
  void Move(hb::Vec3 v){v=v+sep;if(Length3(v-sentVelocity)<0.05f)return;sentVelocity=v;velocityAge=0;hb::Physics::SetVelocity(this,v);}
  static float Length3(const hb::Vec3& v){return std::sqrt(v.x*v.x+v.y*v.y+v.z*v.z);}
};

HB_CLASS(Blueprintable)
class Interactable : public hb::Actor {
public:
  HB_PROPERTY(BlueprintReadWrite)
  std::string Kind = "Note";     // Note·DebtBoard·Entrance·Collector·Interior·Sofa·Smith·Stall·Ore·Herb·Home(집 문)
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
  int Index = -1;                // -1 거점, -2 원룸, 0 던전
  HB_PROPERTY(BlueprintReadWrite)
  std::string Kind = "Hub";      // Hub·Home·Dungeon (던전은 들어올 때마다 방을 무작위로 만듦)
  HB_PROPERTY(BlueprintReadWrite)
  float ExitY = 21;              // 거점: 이보다 위(계단 끝)로 가면 던전. 원룸: 이보다 아래(문)로 가면 거점
  HB_PROPERTY(BlueprintReadWrite)
  float CamMinX = 0;             // 거점·원룸 카메라가 보여 줄 범위 (최소 = 최대면 제한 없음). 맵 바깥이 안 보이게
  HB_PROPERTY(BlueprintReadWrite)
  float CamMinY = 0;
  HB_PROPERTY(BlueprintReadWrite)
  float CamMaxX = 0;
  HB_PROPERTY(BlueprintReadWrite)
  float CamMaxY = 0;
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
  float CritChance = 1.0f;        // 크리티컬 확률 (%) (기획서 4-1)
  HB_PROPERTY(BlueprintReadWrite)
  float CritDamage = 2.0f;        // 크리티컬 피해 배율
  HB_PROPERTY(BlueprintReadWrite)
  float TiredAttack = 0.9f;       // 피로도 75% 이상이면 공격력 배율 (-10%)
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
  float EnemyShotRadius = 0.12f;   // 엔진 탄막 시스템의 탄 반지름 (m). 플레이어 충돌체에 더해져 맞음
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
  float AttackMoveRate = 1.0f;    // 검 베기 중 이동속도 배율
  HB_PROPERTY(BlueprintReadWrite)
  float ChargeMoveRate = 0.7f;    // 활 당기는 중 이동속도 배율
  HB_PROPERTY(BlueprintReadWrite)
  float ArrowMinCharge = 0.12f;   // 셰리: 이만큼은 당겨야 쏨 (그보다 짧게 떼면 취소). 그 뒤로는 당긴 만큼 세짐
  HB_PROPERTY(BlueprintReadWrite)
  float ArrowMinPower = 0.3f;     // 셰리: 살짝 당겨 쏜 화살의 피해 배율 (다 당기면 1, 그 사이는 점점)
  HB_PROPERTY(BlueprintReadWrite)
  float ArrowMinSpeed = 10.0f;    // 셰리: 살짝 당겨 쏜 화살 속도 (다 당기면 ArrowSpeed)
  HB_PROPERTY(BlueprintReadWrite)
  float ArrowPartialCooldown = 0.6f;  // 셰리: 다 당기지 않고 쏘면 다음 당기기까지 쉬는 시간 (덜 당길수록 길게, 최대 이만큼 + 0.15초). 연타 방지
  // ---- 새 캐릭터 시트 (docs/캐릭터_시트_요청.md). 캐릭터마다 그림이 들어오면 AnimSets를 1로 ----
  HB_PROPERTY(BlueprintReadWrite)
  std::vector<int> AnimSets = {0,0,0};  // 0 지금 그림(5방향+반전, 합성 이동공격) / 1 새 시트(8방향, 위상 걷기, 캐릭터별 공격, 대기 행동)
  HB_PROPERTY(BlueprintReadWrite)
  float Stride = 0.5f;            // 새 시트: 걷기 한 장 = 이만큼 움직였을 때 (m). 속도가 바뀌어도 발이 미끄러지지 않음
  HB_PROPERTY(BlueprintReadWrite)
  int IdleFrames = 4;             // 새 시트: 숨쉬기 장수 (0.25초씩)
  HB_PROPERTY(BlueprintReadWrite)
  float SlashStep = 0.45f;        // 새 시트 발렌: 베면서 내딛는 거리 (그림의 발걸음과 같게)
  HB_PROPERTY(BlueprintReadWrite)
  float BackpedalRate = 0.5f;     // 새 시트: 겨눈 채 뒷걸음질 이동속도 배율 (셰리; 알레아는 ChargeMoveRate와 같은 0.7)
  HB_PROPERTY(BlueprintReadWrite)
  float FidgetDelay = 6;          // 새 시트: 이만큼 가만히 있으면 대기 행동 (그 뒤로는 8~12초마다)
  HB_PROPERTY(BlueprintReadWrite)
  std::vector<std::string> Fidgets = {"10,12,8","12,10,6","12,10,8"};  // 캐릭터별 대기 행동 3개의 장수 (0.16초씩)
  HB_PROPERTY(BlueprintReadWrite)
  std::vector<std::string> Muzzles;  // "Sherry_E=150,40": 그 방향 그림(192x96)에서 화살·카드가 나가는 픽셀. 없으면 몸 앞
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
  float CameraSize = 7.5f;       // 화면 세로 절반 (m). 클수록 멀리 보임 (예전 5.625)
  HB_PROPERTY(BlueprintReadWrite)
  float CameraRoomPad = 1.5f;    // 방 기준 카메라에서 바닥 밖으로 더 보여 줄 벽 두께 (m)
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
  std::string HomeScene = "Assets/Scenes/Home_#.hbscene.json";   // # 자리에 원룸 레벨 (공사하면 넓은 방)
  HB_PROPERTY(BlueprintReadWrite)
  std::vector<std::string> SofaSprites;      // 소파 레벨별 그림 (0 낡은 소파 ~ SofaMax)
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
  int TipsShown = 0;             // 이미 보여 준 안내 문구 (비트, 기획서 9장)
  HB_PROPERTY(BlueprintReadWrite)
  bool Paused = false;           // 일시정지 (Esc·P, 모바일 일시정지 버튼)
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
  void FireRing(const hb::Vec3& from,int count,float angle,float speed,const std::string& clip="");  // 사방으로 한 번에
  void ClearBullets(){pendingShots.clear();hb::Projectiles::Clear();}
  // 보스 연출 (Enemy가 부름)
  void Warn(const hb::Vec3& from,const hb::Vec3& dir,float length,float seconds,float width=1.4f);
  void WarnCircle(const hb::Vec3& at,float radius,float seconds);  // 원형 공격 범위 예고 (at은 바닥 높이)   // 공격 예고 붉은 띠 (풀 3개, 다 쓰면 생략)
  void BossSlam(const hb::Vec3& at,int bullets,float speed,const std::string& clip); // 내려찍기 충격파·탄·흔들림
  void BossEnraged(Enemy* e);                                                        // 2페이즈 포효
  void Effect(const std::string& name,const hb::Vec3& at,float angle=0,float glow=0,bool flip=false);  // Assets/Animations/SA_<name> 한 번 재생
  void Shake(float seconds,float power){shake=std::max(shake,seconds);shakePower=std::max(shakePower,power);}  // 화면 흔들림 (seconds 동안, power 세기 배율)
  std::string Sound(const std::string& name) const;  // Sounds에서 이름으로 찾은 경로 (없으면 "")
  static inline int SfxLevel=8;  // 메뉴의 효과음 크기 0~10 (처음으로 돌아가도 유지: 모듈 정적 변수)
  void Sfx(const std::string& name,float pitch=1.f){  // Sounds 값은 "wav 경로|볼륨". 첫 입력 전 효과음은 엔진이 버림
    const auto s=Sound(name);if(s.empty()||SfxLevel<=0)return;const auto bar=s.find('|');const float v=SfxLevel/8.f;
    if(bar==std::string::npos)hb::Audio::Play(s,v,pitch);else hb::Audio::Play(s.substr(0,bar),std::stof(s.substr(bar+1))*v,pitch,"master");}
  void Say(const std::string& who,const std::string& name,const std::string& text){dialog.push_back({who,name,text});}
  void Talk(const std::string& row,const std::map<std::string,std::string>& vars={});  // DT_Dialogue 행의 대사를 차례로
  bool Frozen() const{return Hp<=0||dialogIndex<dialog.size()||Phase<2||cutscene>0||Paused;}
  void Tip(int id);              // 안내 문구 (한 번만, 화면 위 띠). 문구는 DT_Dialogue의 Tip<id> (모바일은 TipTouch<id>가 있으면 그것)  // 쓰러짐·대화·타이틀 중엔 적도 멈춤

private:
  struct Line{std::string who,name,text;};
  // 흐름
  void Begin();                    // 장면 첫 프레임: 구역 확인·상태 이어받기
  void SaveRun();
  bool LoadRun();
  void Leave(int to,const std::string& spawn);  // to: -1 거점, -2 원룸, 0 던전
  void ShowSofa();
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
  void SetPaused(bool paused);
  void UpdateMenu();              // Esc 메뉴: 계속하기 / 효과음 크기 / 메인 화면으로
  void TitleFx(float delta,bool visible);
  void UpdatePrompt(float delta);  // 상호작용 말풍선을 대상 머리 위로 (Screen.cpp)
  void AreaBanner(float delta,bool show);  // 도착한 곳 이름을 가운데에 크게 (Screen.cpp)
  void Notify(const std::string& text){hint=text;hintTime=2.5f;Hud();}
  void HitStop(float seconds){if(Paused)return;hitStopLeft=std::max(hitStopLeft,seconds);hb::Clock::SetTimeScale(0.06f);}  // 타격감: 맞은 순간 멈칫  // 물체와 상관없는 알림 (위 가운데, 잠깐)
  bool NewSheet() const{return Character<(int)rules->AnimSets.size()&&rules->AnimSets[Character]==1;}
  void AnimateSheet(float delta,bool moving,const char* dir);  // 새 시트 (Screen.cpp)
  hb::Vec3 Muzzle(const hb::Vec3& from) const;  // 화살·카드가 나가는 자리  // 타이틀: 횃불 빛 깜빡임, 별 반짝임, 떠오르는 금가루
  void Bag(bool toggle,bool use);  // 가방 (Tab): 소재·아이템, [귀환]은 가방에서 Enter로 사용
  bool UpdateSettle(float delta,bool advance);  // 정산 화면이 떠 있으면 true (이동·행동 막음)
  void ShowSettle(bool visible);
  void ShowEnding();
  void ResetToTitle();
  // 전투
  std::vector<Enemy*> Enemies() const;                       // 나와 있는 적 (대기 중인 적은 뺌)
  void ParkEnemy(Enemy* e);                                  // 화면 밖 대기로 되돌림
  void Slash(const hb::Vec3& position,const std::vector<Enemy*>& enemies);
  void Shoot(const hb::Vec3& from,float power=1.f);  // power: 셰리 활을 당긴 정도 0~1 (피해·속도·문 타격)
  void UpdateShots(float delta,const std::vector<Enemy*>& enemies);
  void UpdateBullets(float delta,const hb::Vec3& position);
  void KeepInside(Enemy* e) const;
  void Separate(const std::vector<Enemy*>& list,const hb::Vec3& player);  // 적끼리·플레이어와 겹치면 밀어 냄  // 싸우는 방 밖으로 밀려난 적을 방 안으로 되돌림
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
  void UpdateAmbient(float delta,const hb::Vec3& player,bool attacking);  // 새·나비·구름 그늘·박쥐·쥐 (World.cpp)
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
  // HUD 호출은 값이 바뀔 때만 보낸다. 같은 값을 매 프레임 보내면 에디터가 그때마다 화면을 다시 그려서 끊긴다
  std::map<std::string,std::string> uiSent;hb::Actor* uiOwner=nullptr;
  bool UiChanged(const std::string& key,const std::string& value){
    if(frame<2)return true;  // 위젯은 첫 프레임 뒤에 생겨 그 전 호출은 무시될 수 있으니 기억하지 않는다
    if(uiOwner!=player){uiOwner=player;uiSent.clear();}
    auto it=uiSent.find(key);if(it!=uiSent.end()&&it->second==value)return false;uiSent[key]=value;return true;}
  static std::string UiNum(float a,float b){return std::to_string(a)+","+std::to_string(b);}
  static const char* UiInstance(const std::string& n){  // 앞 화면(타이틀·로딩·선택·엔딩·메뉴)은 W_Front, 나머지는 W_TopDown (tools/gen_hud.py FRONT)
    if(n=="Title")return "HUD";  // HUD의 지역 이름
    for(auto* p:{"Title","Loading","Select","Ending","Menu"})if(n.rfind(p,0)==0)return "Front";
    return "HUD";}
  void UiVisible(const std::string& n,bool v){if(UiChanged("v"+n,v?"1":"0"))hb::UI::SetVisible(player,UiInstance(n),n,v);}
  void UiText(const std::string& n,const std::string& v){if(UiChanged("t"+n,v))hb::UI::SetText(player,UiInstance(n),n,v);}
  void UiTexture(const std::string& n,const std::string& v){if(UiChanged("x"+n,v))hb::UI::SetTexture(player,UiInstance(n),n,v);}
  void UiValue(const std::string& n,float v){if(UiChanged("f"+n,std::to_string(v)))hb::UI::SetValue(player,UiInstance(n),n,v);}
  void UiPosition(const std::string& n,const hb::Vec2& v){if(UiChanged("p"+n,UiNum(v.x,v.y)))hb::UI::SetPosition(player,UiInstance(n),n,v);}
  void UiSize(const std::string& n,const hb::Vec2& v){if(UiChanged("s"+n,UiNum(v.x,v.y)))hb::UI::SetSize(player,UiInstance(n),n,v);}
  void UiOpacity(const std::string& n,float v){if(UiChanged("o"+n,std::to_string(v)))hb::UI::SetOpacity(player,UiInstance(n),n,v);}
  void UiColor(const std::string& n,const hb::Color& c){if(UiChanged("c"+n,UiNum(c.r,c.g)+UiNum(c.b,c.a)))hb::UI::SetColor(player,UiInstance(n),n,c);}
  void UiScale(const std::string& n,float v){if(UiChanged("k"+n,std::to_string(v)))hb::UI::SetScale(player,UiInstance(n),n,hb::Vec2{v,v});}
  hb::Vec3 playerAt{0,0,0},facing{1,0,0},cameraAt{0,0,0};
  bool playerFlipped=false,blinkShown=false;
  hb::Vec3 knock{0,0,0};
  bool cameraReady=false,started=false,leaving=false,hudDirty=true,introHidden=false;
  int rotShown=-1;                // 지금 보이는 버튼 그림 (귀환 테마*10 + 캐릭터)
  int frame=0,area=-1,fightingRoom=-1;
  std::string roomKind="Hub";
  float exitY=21;
  bool inHome=false,inDungeon=false,monsterDrop=false,exitArmed=false,minimapDirty=false;
  Dungeon map;
  hb::Json roomTable;                    // DT_Rooms 행들
  hb::Json dialogue;                     // DT_Dialogue 행들 (Lines가 처음 부를 때 한 번 읽음)
  hb::Json Lines(const std::string& id);
  std::vector<std::string> waves;        // 싸우는 방의 남은 웨이브 ("S,S,M" 하나씩)
  size_t wave=0;
  int waveAlive=0;                       // 이번 웨이브에서 나와 아직 살아 있는 적 (생성 직후 한 프레임은 적 목록에 안 잡혀서 직접 셈)
  struct Pending{hb::Vec3 at;std::string blueprint;float left;bool invulnerable;};
  std::vector<Pending> pending;          // 예고 중인 적
  int returnRoom=-1,returnDir=-1;        // 귀환 중 때려 열어야 하는 문
  std::set<std::string> taken;     // 채집한 것 ("방번호:Kind")
  std::vector<Interactable*> interactables;
  float attackCooldown=0,dodgeTimer=0,dodgeCooldownLeft=0,invulnerable=0,gameOver=0,charge=0;
  float cutscene=0,bannerTime=0,bossBarShown=-1;hb::Vec3 cutsceneAt{0,0,0};bool roared=false;  // 보스 등장 컷신·자막
  // 공격 범위 예고: 테두리 + 안쪽 채움 (시간에 따라 차오르고 다 차면 맞는 순간). 띠(돌진·베기)·원(도약·회전·금화 비)
  std::vector<hb::Actor*> warnPool,warnFillPool,circlePool,circleFillPool;
  struct WarnLine{hb::Actor* actor;hb::Actor* fill;float left,total;bool circle;hb::Vec3 from,dir;float length,width;};std::vector<WarnLine> warns;
  float attackAnim=0,walkTime=0,breathTime=0,shake=0,aimHold=0,sentSpeed=0,knockTimer=0,idleTime=0,runTime=0,typeTime=0,phaseTime=0;
  std::string currentSprite,currentMusic,hint,shownWho;
  // 적 탄은 엔진 탄막 시스템(hb::Projectiles)이 오브젝트 없이 한꺼번에 움직이고 그린다.
  // 탄 주인은 발사한 액터라서 적 함수(적 맥락)에서 바로 쏘지 않고 모았다가 Director Tick에서 쏜다 (충돌 묶음을 Director가 받음)
  std::vector<hb::Json> pendingShots;
  hb::Actor* shotGuard=nullptr;float guardTime=0;  // 발렌 베기가 탄을 지우는 상자 (플레이어 탄 풀에서 하나를 빌려 투명하게)
  bool playerHittable=false;
  std::map<hb::Actor*,float> shots;        // 플레이어 탄
  std::map<hb::Actor*,bool> shotBoom;
  std::map<hb::Actor*,float> shotPower;  // 화살마다 당긴 정도 (피해 배율)
  std::map<hb::Actor*,int> coins;
  Enemy* boss=nullptr;
  std::vector<Line> dialog;
  size_t dialogIndex=0,shownChars=0;
  float fpsTime=0,fpsWorst=0;int fpsFrames=0;bool fpsHeld=false;
  struct Critter{hb::Actor* a=nullptr;int kind=0,state=0;hb::Vec3 home,at,vel;float t=0,timer=0;bool flip=false;};
  std::vector<Critter> critters;bool ambientReady=false;hb::Vec3 camMin{0,0,0},camMax{0,0,0};
  float walkDist=0,stillTime=0,fidgetTime=0;int fidget=0,lastFidget=0;bool slashB=false;hb::Vec3 animPos{0,0,0};  // 새 시트 애니메이션 상태
  Interactable* promptTarget=nullptr;std::string promptText;float hintTime=0,areaBannerTime=0;bool bannerPending=false,mapHeld=false;  // 상호작용 말풍선·알림·지역 이름
  float hitStopLeft=0,shakePower=1,cutZoom=1;  // 맞는 순간 아주 잠깐 느려짐(남은 실제 시간), 흔들림 세기 배율
  float tipTime=0,titleTime=0;bool pauseHeld=false,bagOpen=false;int menuPick=0,menuHeld=0;
  std::map<hb::Actor*,hb::Vec3> frozenVelocity;   // 일시정지 동안 멈춘 탄의 속도
  // 정산 화면: 줄이 하나씩 나타나고 남은 빚이 줄어드는 숫자 연출
  std::vector<std::string> settleRows;
  float settleTime=-1;int settleShown=0,debtFrom=0,debtTo=0,debtShown=-1;bool settleDone=false;
  bool warpHeld=false,dodgeHeld=false,returnHeld=false,flashHeld=false,craftOpen=false,craftKeyHeld=false,confirmHeld=false;
  bool advanceHeld=true,selecting=false,ending=false,anyHeld=true,touchMode=false,gatherTold=false;
  int craftPick=1,pick=0,pickHeld=0;
};
