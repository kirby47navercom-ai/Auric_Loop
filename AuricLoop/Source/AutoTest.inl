// 자동 검사: 환경 변수 AURIC_AUTOTEST가 있을 때만 동작 (부스·배포 실행엔 없음). tools/measure_native.mjs가 숨긴 창으로 실행한다.
// 창에 키·클릭을 보내지 않고 게임 규칙 안에서 직접 행동:
//   보스방(Test_Boss, 발렌): 적에게 화상(도트)을 걸고 14초 뒤 모두 처치 → 보스 처치 직후·피격 중에 [귀환]
//   거점: 정산·대화를 넘기고 10초 머문 뒤 셰리(관통 각인)로 던전 → 첫 전투방에서 관통 화살 전투 → 보스방 → 같은 방식으로 귀환 → 반복
// AURIC_AUTOTEST_LOG 파일에 프레임마다 "간격ms 구간" (구간: hub settle walk room boss fx, stop=멈칫(히트스톱) 중), 사건은 "# ..." 줄
#include <chrono>
#include <cstdio>
#include <cstdlib>

namespace autotest{
inline bool On(){static const bool on=std::getenv("AURIC_AUTOTEST")!=nullptr;return on;}
inline std::FILE* Log(){static std::FILE* f=[]{const char* p=std::getenv("AURIC_AUTOTEST_LOG");return p?std::fopen(p,"a"):nullptr;}();return f;}
inline void Event(const char* text){if(auto* f=Log()){std::fprintf(f,"# %s\n",text);std::fflush(f);}}
inline std::chrono::steady_clock::time_point last{};
}

bool TopDownShooter::AutoPress(){
  if(!autotest::On())return false;
  const auto now=std::chrono::steady_clock::now();
  if(auto* f=autotest::Log();f&&autotest::last.time_since_epoch().count()){
    const char* phase=inDungeon&&hitStopLeft>0?"stop":!inDungeon?(settleTime>=0?"settle":"hub"):(deathCam>0||impact.t>=0)?"fx":roomKind=="Boss"&&fightingRoom>=0?"boss":fightingRoom>=0?"room":"walk";
    std::fprintf(f,"%.2f %s\n",std::chrono::duration<double,std::milli>(now-autotest::last).count(),phase);}
  autotest::last=now;
  return frame%20==0;  // 0.33초마다 한 번 누름 (대화·정산 넘기기)
}

void TopDownShooter::AutoTest(float delta,const hb::Vec3& position,const std::vector<Enemy*>& enemies){
  if(!autotest::On()||Phase<2)return;
  auto& a=autoState;a.t+=delta;
  auto killAll=[&](bool burn){const int was=Enchant;if(burn)Enchant=2;  // 화상(도트)이 걸린 채로 쓰러뜨림
    for(auto* e:Enemies())if(!e->Parked)HitEnemy(e,Normal(hb::Scene::GetPosition(e)-position,facing),burn?0.5f:e->Hp+1);
    Enchant=was;};
  if(!inDungeon){  // 거점: 정산·대화가 끝나고 10초 머문 뒤 셰리·관통 각인으로 던전
    if(!inHome&&settleTime<0&&dialogIndex>=dialog.size()&&a.t>10){autotest::Event("leave hub");Character=1;Enchant=3;Leave(0,"");}
    return;}
  if(!a.hit)invulnerable=std::max(invulnerable,0.3f);  // 검사 중엔 쓰러지지 않게 (피격 귀환 순간만 맞음)
  if((a.wait-=delta)>0)return;
  // 공격: 셰리는 가장 가까운 적에게 다 당긴 화살(관통), 발렌은 1초마다 화상만 검
  if(fightingRoom>=0&&!Frozen()&&(a.shot-=delta)<=0&&!enemies.empty()){
    if(Character==1){Enemy* near=enemies.front();for(auto* e:enemies)if(Length(hb::Scene::GetPosition(e)-position)<Length(hb::Scene::GetPosition(near)-position))near=e;
      aimAt=hb::Scene::GetPosition(near);aimValid=true;touchMode=false;facing=Normal(aimAt-position,facing);Shoot(position,1.f);attackAnim=0.44f;a.shot=0.3f;}
    else{killAll(true);a.shot=1.f;}}
  if(fightingRoom>=0){a.fight+=delta;
    if(a.fight>(roomKind=="Boss"?14.f:20.f)){char line[64];std::snprintf(line,sizeof line,"kill all in %s",roomKind.c_str());autotest::Event(line);killAll(true);killAll(false);}
    return;}
  if(roomKind=="Boss"&&HasReturnItem){  // 보스방 정리 끝: 맞는 순간(멈칫 중)에 바로 귀환
    if(!a.hit){a.hit=true;invulnerable=0;dodgeTimer=0;DamagePlayer(1,position+hb::Vec3{0.8f,0,0});autotest::Event("hit");}
    if(CanReturn()){autotest::Event("return");ReturnHome();}
    return;}
  if(a.t<1.5f)return;
  // 시작 방 → 첫 전투방 → 보스방
  if(a.step==0){a.step=1;a.fight=0;for(int i=0;i<int(map.rooms.size());++i)if(map.rooms[i].kind=="Combat"&&map.rooms[i].path>=0){autotest::Event("warp room");Warp(i);break;}a.wait=1;return;}
  if(a.step==1&&std::getenv("AURIC_AUTOTEST_DIE")){autotest::Event("die after clear");Hp=0;gameOver=rules->RespawnDelay;a.step=2;return;}  // 방 클리어 직후 쓰러짐 (check_loot)
  if(vacuumTime>0)return;  // 클리어 보상이 다 들어올 때까지
  if(a.step==1){a.step=2;a.fight=0;{char line[64];std::snprintf(line,sizeof line,"warp boss (room hits %d shots %d)",Hits,Swings);autotest::Event(line);}Warp(map.boss);a.wait=1;}
}
